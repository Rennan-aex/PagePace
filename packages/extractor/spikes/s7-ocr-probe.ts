// Spike E9-T01 (OCR): render pages, run tesseract.js (WASM) and native
// Tesseract (CLI) on the same images, dump text layers, compute CER.
// Outputs go to .pagepace-cache/spikes/S7/ (gitignored - contains corpus text).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createWorker } from "tesseract.js";

(globalThis as Record<string, unknown>).DOMMatrix = DOMMatrix;
(globalThis as Record<string, unknown>).ImageData = ImageData;
(globalThis as Record<string, unknown>).Path2D = Path2D;

const repoRoot = path.join(import.meta.dirname, "../../..");
const corpusDir = process.env.CORPUS_PRIVATE_DIR ?? "<CORPUS_PRIVATE_DIR>";
const outDir = path.join(repoRoot, ".pagepace-cache", "spikes", "S7");
const pdfjsRoot = path.join(import.meta.dirname, "..", "node_modules", "pdfjs-dist");
const toDataPath = (dir: string): string => `${dir.replace(/\\/g, "/").replace(/\/+$/, "")}/`;
const PDFJS_ASSETS = {
  standardFontDataUrl: toDataPath(path.join(pdfjsRoot, "standard_fonts")),
  cMapUrl: toDataPath(path.join(pdfjsRoot, "cmaps")),
  cMapPacked: true,
  wasmUrl: toDataPath(path.join(pdfjsRoot, "wasm")),
  isEvalSupported: false,
};
const nativeTess =
  process.env.S7_NATIVE_TESS ?? "C:\\Program Files\\Tesseract-OCR\\tesseract.exe";

mkdirSync(outDir, { recursive: true });

function pngPath(id: string, page: number): string {
  return path.join(outDir, `${id}-p${page}.png`);
}

function parseFlags(argv: string[]): { positional: string[]; flags: Map<string, string> } {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (match) flags.set(match[1], match[2] ?? "true");
    else positional.push(arg);
  }
  return { positional, flags };
}

function normalize(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

function cer(hypothesis: string, reference: string): number {
  const a = normalize(hypothesis);
  const b = normalize(reference);
  if (b.length === 0) return a.length === 0 ? 0 : 1;
  const prev = new Uint32Array(b.length + 1);
  const curr = new Uint32Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev.set(curr);
  }
  return prev[b.length] / b.length;
}

function rssMb(): number {
  return Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10;
}

function emit(result: Record<string, unknown>): void {
  const line = JSON.stringify(result);
  console.log(line);
  writeFileSync(path.join(outDir, "results.ndjson"), `${line}\n`, { flag: "a" });
}

async function cmdRender(id: string, pages: number[], scale: number): Promise<void> {
  const bytes = new Uint8Array(readFileSync(path.join(corpusDir, `${id}.pdf`)));
  const task = getDocument({ data: bytes, verbosity: 0, ...PDFJS_ASSETS });
  const pdf = await task.promise;
  for (const pageNum of pages) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport } as never).promise;
    writeFileSync(pngPath(id, pageNum), await canvas.encode("png"));
    emit({
      event: "render",
      id,
      page: pageNum,
      scale,
      width: canvas.width,
      height: canvas.height,
    });
  }
  await task.destroy();
}

async function cmdLayer(id: string, pageNum: number): Promise<void> {
  const bytes = new Uint8Array(readFileSync(path.join(corpusDir, `${id}.pdf`)));
  const task = getDocument({ data: bytes, verbosity: 0, ...PDFJS_ASSETS });
  const pdf = await task.promise;
  const page = await pdf.getPage(pageNum);
  const content = await page.getTextContent();
  type Item = { str: string; transform: number[]; width: number };
  const items = content.items.filter(
    (i: unknown) => typeof (i as { str?: string }).str === "string",
  ) as Item[];
  const lines: Array<{ y: number; parts: string[] }> = [];
  for (const item of items) {
    const y = item.transform[5];
    const last = lines[lines.length - 1];
    if (last && Math.abs(y - last.y) < 3) {
      const gap = item.transform[4] - (last.endX ?? 0);
      if (gap > 0.5 * Math.max(item.width, 1)) last.parts.push(" ");
      last.parts.push(item.str);
      last.endX = item.transform[4] + item.width;
    } else {
      lines.push({ y, parts: [item.str], endX: item.transform[4] + item.width });
    }
  }
  const text = lines.map((l) => l.parts.join("")).join("\n");
  const out = path.join(outDir, `${id}-p${pageNum}.layer.txt`);
  writeFileSync(out, text);
  emit({ event: "layer", id, page: pageNum, lines: lines.length, chars: text.length, out });
  await task.destroy();
}

function tessdataPath(lang: string, tag: string): string {
  const dir = path.join(outDir, `tessdata-${lang}-${tag}`);
  if (!existsSync(path.join(dir, `${lang}.traineddata`))) {
    mkdirSync(dir, { recursive: true });
    const variant = tag === "best" ? "4.0.0_best_int" : "4.0.0";
    const gz = path.join(
      repoRoot,
      "node_modules",
      "@tesseract.js-data",
      lang,
      variant,
      `${lang}.traineddata.gz`,
    );
    writeFileSync(path.join(dir, `${lang}.traineddata`), gunzipSync(readFileSync(gz)));
  }
  return dir;
}

function cmdPrep(): void {
  for (const lang of ["eng", "por"]) {
    for (const tag of ["best", "std"]) {
      const dir = tessdataPath(lang, tag);
      emit({
        event: "prep",
        lang,
        tag,
        bytes: readFileSync(path.join(dir, `${lang}.traineddata`)).length,
        dir,
      });
    }
  }
}

async function cmdTjs(images: string[], lang: string, tag: string): Promise<void> {
  const langPath = tessdataPath(lang, tag);
  const t0 = performance.now();
  const worker = await createWorker(lang, 1, {
    langPath,
    gzip: false,
    cachePath: path.join(outDir, "tjs-cache"),
    logger: () => {},
  });
  const initMs = performance.now() - t0;
  emit({ event: "tjs-init", lang, tag, initMs: Math.round(initMs), rssMb: rssMb() });
  for (const image of images) {
    const t1 = performance.now();
    const { data } = await worker.recognize(image);
    const ms = Math.round(performance.now() - t1);
    const out = image.replace(/\.png$/, `.tjs-${lang}-${tag}.txt`);
    writeFileSync(out, data.text);
    emit({
      engine: "tesseract.js",
      lang,
      tag,
      image: path.basename(image),
      ms,
      chars: data.text.length,
      conf: Math.round(data.confidence * 10) / 10,
      rssMb: rssMb(),
      out,
    });
  }
  await worker.terminate();
}

function cmdNative(images: string[], lang: string, tag: string): void {
  const dir = tessdataPath(lang, tag);
  for (const image of images) {
    const t0 = performance.now();
    const run = spawnSync(nativeTess, [image, "stdout", "-l", lang, "--oem", "1", "--tessdata-dir", dir], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    const ms = Math.round(performance.now() - t0);
    if (run.status !== 0) {
      emit({ engine: "tesseract-native", error: run.stderr?.slice(0, 300), image });
      continue;
    }
    const text = run.stdout;
    const out = image.replace(/\.png$/, `.nat-${lang}-${tag}.txt`);
    writeFileSync(out, text);
    emit({
      engine: "tesseract-native",
      lang,
      tag,
      image: path.basename(image),
      ms,
      chars: text.length,
      rssMb: rssMb(),
      out,
    });
  }
}

function cmdCer(hypFile: string, refFile: string): void {
  const hyp = readFileSync(hypFile, "utf8");
  const ref = readFileSync(refFile, "utf8");
  const value = cer(hyp, ref);
  emit({
    event: "cer",
    hyp: path.basename(hypFile),
    ref: path.basename(refFile),
    cer: Math.round(value * 10000) / 10000,
    hypChars: normalize(hyp).length,
    refChars: normalize(ref).length,
  });
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseFlags(rest);
  const lang = flags.get("lang") ?? "eng";
  const tag = flags.get("tag") ?? "best";
  switch (command) {
    case "render": {
      await cmdRender(positional[0], positional.slice(1).map(Number), Number(flags.get("scale") ?? 2));
      break;
    }
    case "layer": {
      await cmdLayer(positional[0], Number(positional[1]));
      break;
    }
    case "prep": {
      cmdPrep();
      break;
    }
    case "tjs": {
      await cmdTjs(positional, lang, tag);
      break;
    }
    case "native": {
      cmdNative(positional, lang, tag);
      break;
    }
    case "cer": {
      cmdCer(positional[0], positional[1]);
      break;
    }
    default: {
      console.error("usage: s7-ocr-probe render|layer|prep|tjs|native|cer ...");
      process.exit(2);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
