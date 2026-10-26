// Spike BACKLOG-26 part 2: raw ToUnicode of the sofia fonts, visual render of
// the swapped words, and the standalone "?" glyphs of n4-pt-astrofisica.
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync, inflateRawSync } from "node:zlib";
import path from "node:path";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

// Node canvas globals pdf.js needs when rendering (S1 recipe).
(globalThis as Record<string, unknown>).DOMMatrix = DOMMatrix;
(globalThis as Record<string, unknown>).ImageData = ImageData;
(globalThis as Record<string, unknown>).Path2D = Path2D;

const dir = process.env.CORPUS_PRIVATE_DIR ?? "<CORPUS_PRIVATE_DIR>";
const outDir = path.join(import.meta.dirname, "../../../.pagepace-cache/tmp");

function hex(code: number): string {
  return "U+" + code.toString(16).toUpperCase().padStart(4, "0");
}

function inflateStream(bytes: Buffer): string | null {
  for (const inflate of [inflateSync, inflateRawSync]) {
    try {
      const text = inflate(bytes).toString("latin1");
      if (text.includes("begincmap")) return text;
    } catch {
      // try next
    }
  }
  const asIs = bytes.toString("latin1");
  return asIs.includes("begincmap") ? asIs : null;
}

/** Every `<src> <dst>` pair of a ToUnicode CMap, dst as full string. */
function parsePairs(text: string): Array<[number, string]> {
  const pairs: Array<[number, string]> = [];
  const decode = (hexDigits: string): string => {
    let out = "";
    for (let i = 0; i + 4 <= hexDigits.length; i += 4) {
      out += String.fromCodePoint(parseInt(hexDigits.slice(i, i + 4), 16));
    }
    return out;
  };
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      pairs.push([parseInt(pair[1], 16), decode(pair[2])]);
    }
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const range of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      const lo = parseInt(range[1], 16);
      const hi = parseInt(range[2], 16);
      const base = decode(range[3]);
      for (let c = lo; c <= hi && c - lo < 512; c++) {
        pairs.push([c, String.fromCodePoint(base.codePointAt(0) ?? 0x3f + (c - lo))]);
      }
    }
  }
  return pairs;
}

function dumpToUnicodeCMaps(filePath: string, wanted: (name: string) => boolean): void {
  const bytes = readFileSync(filePath);
  const raw = bytes.toString("latin1");
  const streamRe = /(\d+)\s+0\s+obj\b([\s\S]{0,600}?)stream\r?\n/g;
  let match: RegExpExecArray | null;
  const reports: string[] = [];
  while ((match = streamRe.exec(raw)) !== null) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) continue;
    const text = inflateStream(bytes.subarray(start, end));
    if (!text) continue;
    const pairs = parsePairs(text);
    if (pairs.length === 0) continue;
    // Attribute the CMap: look backwards from the stream obj for a font dict
    // that references this object number.
    const refRe = new RegExp(`/BaseFont\\s*/([^\\s/<>\\[\\]()]+)[\\s\\S]{0,1500}?/ToUnicode\\s+${match[1]}\\s+0\\s+R`);
    const byRef = refRe.exec(raw);
    const revRefRe = new RegExp(`/ToUnicode\\s+${match[1]}\\s+0\\s+R[\\s\\S]{0,1500}?/BaseFont\\s*/([^\\s/<>\\[\\]()]+)`);
    const byRef2 = revRefRe.exec(raw);
    const fontName = byRef?.[1] ?? byRef2?.[1] ?? `obj-${match[1]}`;
    if (!wanted(fontName) && fontName.startsWith("obj-")) continue;
    if (!wanted(fontName)) continue;
    const interesting = pairs.filter(([, uni]) =>
      ["à", "á", "ﬁ", "fl", "ﬀ", "?", "Ã", "æ"].includes(uni),
    );
    reports.push(
      `CMap obj ${match[1]} font=${fontName} pairs=${pairs.length} interesting=${interesting.length}\n` +
        interesting
          .slice(0, 20)
          .map(([code, uni]) => `  ${hex(code)} -> ${JSON.stringify(uni)} (${[...uni].map((c) => hex(c.codePointAt(0) ?? 0)).join(" ")})`)
          .join("\n"),
    );
  }
  console.log(reports.join("\n") || "no CMaps matched");
}

// ------------------------------------------------------------------ sofia ----
console.log("===== n1-pt-sofia: ToUnicode CMaps (interesting entries) =====");
dumpToUnicodeCMaps(path.join(dir, "n1-pt-sofia.pdf"), (name) => /Palatino|Cambria/i.test(name));

// Render the page region of one "Soàa" item so we can SEE the glyph.
async function renderRegions(
  file: string,
  predicate: (text: string) => boolean,
  tag: string,
  limit = 3,
): Promise<void> {
  const bytes = new Uint8Array(readFileSync(path.join(dir, file)));
  const task = getDocument({ data: bytes, fontExtraProperties: true, verbosity: 0 });
  const pdf = await task.promise;
  outer: for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items.filter((i: unknown) => typeof (i as { str?: string }).str === "string") as Array<{
      str: string;
      transform: number[];
      width: number;
      height: number;
    }>;
    const hits = items.filter((i) => predicate(i.str));
    if (hits.length > 0) {
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport } as never).promise;
      let drawn = 0;
      for (const hit of hits) {
        if (drawn >= limit) break;
        const [, , , , x, y] = hit.transform;
        const w = hit.width * 2;
        const h = Math.max(hit.height * 2, 18);
        const top = viewport.height - y * 2 - h * 1.6;
        const left = Math.max(x * 2 - 10, 0);
        const cropW = Math.min(w + 40, canvas.width - left);
        const cropH = Math.min(h * 3, canvas.height - top);
        if (cropW <= 0 || cropH <= 0) continue;
        const crop = createCanvas(Math.ceil(cropW), Math.ceil(cropH));
        crop.getContext("2d").drawImage(canvas, left, Math.max(top, 0), Math.ceil(cropW), Math.ceil(cropH), 0, 0, Math.ceil(cropW), Math.ceil(cropH));
        const out = path.join(outDir, `${tag}-p${p}-${drawn}.png`);
        writeFileSync(out, crop.toBuffer("image/png"));
        console.log(`rendered ${out} item=${JSON.stringify(hit.str.slice(0, 40))}`);
        drawn += 1;
      }
      break outer;
    }
    page.cleanup();
  }
  await task.destroy();
}

console.log("\n===== n1-pt-sofia: visual check of Soàa =====");
await renderRegions("n1-pt-sofia.pdf", (t) => t.includes("Soàa"), "sofia-soaa");

// --------------------------------------------------------------------- n4 ----
console.log("\n===== n4-pt-astrofisica: standalone ? glyphs =====");
async function n4QuestionGlyphs(): Promise<void> {
  const filePath = path.join(dir, "n4-pt-astrofisica.pdf");
  const bytes = new Uint8Array(readFileSync(filePath));
  const task = getDocument({ data: bytes, fontExtraProperties: true, verbosity: 0 });
  const pdf = await task.promise;
  const meta = (await pdf.getMetadata().catch(() => null)) as { info?: Record<string, unknown> } | null;
  console.log(`pages=${pdf.numPages} producer=${meta?.info?.Producer ?? "?"}`);
  // Find pages with the "F (d) ? F" shape (spacing may vary).
  const needlePages: number[] = [];
  for (let p = 1; p <= pdf.numPages && needlePages.length < 3; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const text = content.items.map((i: unknown) => (i as { str?: string }).str ?? "").join("");
    if (/\(\s*d\s*\)\s*\?\s*F/.test(text) || /\?\s*F\s*[\s(]/.test(text)) needlePages.push(p);
    page.cleanup();
  }
  console.log("pages matching ? F pattern:", needlePages);
  const p = needlePages[0] ?? 1;
  const page = await pdf.getPage(p);
  const ops = await page.getOperatorList();
  let currentFont = "?";
  const counts = new Map<string, { count: number; sample: string }>();
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] as unknown[];
    if (fn === OPS.setFont) {
      currentFont = String(args[0]);
      continue;
    }
    if (fn !== OPS.showText) continue;
    for (const glyph of args[0] as Array<Record<string, unknown>>) {
      if (glyph.unicode !== "?") continue;
      const charcode = Number(glyph.originalCharCode ?? -1);
      const key = `${currentFont}|${hex(charcode)}`;
      const entry = counts.get(key) ?? { count: 0, sample: "" };
      entry.count += 1;
      entry.sample = String(glyph.fontChar ?? "");
      counts.set(key, entry);
    }
  }
  for (const [key, value] of counts) {
    console.log(`  ? glyphs: font=${key} count=${value.count} fontChar=${JSON.stringify(value.sample)}`);
  }
  // Context around the first "?" item on the page.
  const content = await page.getTextContent();
  const items = content.items as Array<{ str: string }>;
  for (let i = 0; i < items.length; i++) {
    if (items[i].str.includes("?")) {
      const ctx = items.slice(Math.max(0, i - 5), i + 6).map((it) => it.str);
      console.log(`  context: ${JSON.stringify(ctx)}`);
      break;
    }
  }
  page.cleanup();
  await task.destroy();
}
await n4QuestionGlyphs();
