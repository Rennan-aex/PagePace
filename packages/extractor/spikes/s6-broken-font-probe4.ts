// Spike BACKLOG-26 part 4: where do the "?" of n4-pt-astrofisica come from?
// Standalone "?" items, glyph charcodes/fonts, visual render, ToUnicode CMaps.
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync, inflateRawSync } from "node:zlib";
import path from "node:path";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

(globalThis as Record<string, unknown>).DOMMatrix = DOMMatrix;
(globalThis as Record<string, unknown>).ImageData = ImageData;
(globalThis as Record<string, unknown>).Path2D = Path2D;

const dir = process.env.CORPUS_PRIVATE_DIR ?? "<CORPUS_PRIVATE_DIR>";
const filePath = path.join(dir, "n4-pt-astrofisica.pdf");
const outDir = path.join(import.meta.dirname, "../../../.pagepace-cache/tmp");

function hex(code: number): string {
  return "U+" + code.toString(16).toUpperCase().padStart(4, "0");
}

const bytes = new Uint8Array(readFileSync(filePath));
const task = getDocument({ data: bytes, fontExtraProperties: true, verbosity: 0 });
const pdf = await task.promise;

// 1. Pages/items with a lone "?" token.
let pagesWithQ = 0;
let loneQItems = 0;
const samples: Array<{ page: number; context: string[] }> = [];
for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  const content = await page.getTextContent();
  const items = (content.items as Array<{ str: string }>).map((i) => i.str);
  let pageHas = false;
  for (let i = 0; i < items.length; i++) {
    if (items[i].trim() !== "?") continue;
    loneQItems += 1;
    pageHas = true;
    if (samples.length < 8) {
      samples.push({ page: p, context: items.slice(Math.max(0, i - 4), i + 5) });
    }
  }
  if (pageHas) pagesWithQ += 1;
  page.cleanup();
}
console.log(`pagesWithLoneQuestion=${pagesWithQ}/${pdf.numPages} loneQuestionItems=${loneQItems}`);
for (const s of samples) console.log(`  p${s.page}: ${JSON.stringify(s.context)}`);

// 2. Glyph-level detail + render on the first page with a lone "?".
const firstPage = samples[0]?.page ?? 1;
const page = await pdf.getPage(firstPage);
const ops = await page.getOperatorList();
let currentFont = "?";
const perFont = new Map<string, { count: number; charcodes: Set<number> }>();
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
    const entry = perFont.get(currentFont) ?? { count: 0, charcodes: new Set<number>() };
    entry.count += 1;
    entry.charcodes.add(charcode);
    perFont.set(currentFont, entry);
  }
}
console.log(`\npage ${firstPage}: ? glyphs by font`);
for (const [font, entry] of perFont) {
  const obj = page.commonObjs.get(font) as { name?: string } | undefined;
  console.log(
    `  ${font} realName=${obj?.name ?? "?"} count=${entry.count} charcodes=[${[...entry.charcodes].map(hex).join(",")}]`,
  );
}
// Render a strip containing the lone "?".
const content = await page.getTextContent();
const items = content.items as Array<{ str: string; transform: number[]; width: number; height: number }>;
const hit = items.find((i) => i.str.trim() === "?");
if (hit) {
  const viewport = page.getViewport({ scale: 2 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport } as never).promise;
  const [, , , , x, y] = hit.transform;
  const left = Math.max(x * 2 - 120, 0);
  const top = Math.max(viewport.height - y * 2 - 30, 0);
  const cropW = Math.min(260, canvas.width - left);
  const cropH = Math.min(60, canvas.height - top);
  const crop = createCanvas(Math.ceil(cropW), Math.ceil(cropH));
  crop
    .getContext("2d")
    .drawImage(canvas, left, top, Math.ceil(cropW), Math.ceil(cropH), 0, 0, Math.ceil(cropW), Math.ceil(cropH));
  const out = path.join(outDir, `n4-question-p${firstPage}.png`);
  writeFileSync(out, crop.toBuffer("image/png"));
  console.log(`rendered ${out}`);
}
page.cleanup();
await task.destroy();

// 3. ToUnicode CMaps of n4 with "?" or ligature-like entries.
const rawBytes = readFileSync(filePath);
const raw = rawBytes.toString("latin1");
const streamRe = /(\d+)\s+0\s+obj\b/g;
let match: RegExpExecArray | null;
const cmaps: Array<{ obj: string; text: string }> = [];
while ((match = streamRe.exec(raw)) !== null) {
  const after = raw.slice(match.index, match.index + 800);
  const sm = /stream(\r\n|\r|\n)/.exec(after);
  if (!sm) continue;
  const start = match.index + sm.index + sm[0].length;
  const end = raw.indexOf("endstream", start);
  if (end < 0) continue;
  for (const inflate of [inflateSync, inflateRawSync]) {
    try {
      const text = inflate(rawBytes.subarray(start, end)).toString("latin1");
      if (text.includes("begincmap")) cmaps.push({ obj: match[1], text });
      break;
    } catch {
      // next
    }
  }
}
console.log(`\nn4 cmap streams=${cmaps.length}`);
function decode(hexDigits: string): string {
  let out = "";
  for (let i = 0; i + 4 <= hexDigits.length; i += 4) {
    out += String.fromCodePoint(parseInt(hexDigits.slice(i, i + 4), 16));
  }
  return out;
}
for (const cmap of cmaps) {
  const pairs: Array<[number, string]> = [];
  for (const block of cmap.text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      pairs.push([parseInt(pair[1], 16), decode(pair[2])]);
    }
  }
  for (const block of cmap.text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const range of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      const lo = parseInt(range[1], 16);
      const hi = parseInt(range[2], 16);
      const base = decode(range[3]);
      const baseCp = base.codePointAt(0) ?? 0x3f;
      for (let c = lo; c <= hi && c - lo < 512; c++) pairs.push([c, String.fromCodePoint(baseCp + (c - lo))]);
    }
  }
  const refRe = new RegExp(`/BaseFont\\s*/([^\\s/<>]+)[\\s\\S]{0,2000}?/ToUnicode\\s+${cmap.obj}\\s+0\\s+R`);
  const refRe2 = new RegExp(`/ToUnicode\\s+${cmap.obj}\\s+0\\s+R[\\s\\S]{0,2000}?/BaseFont\\s*/([^\\s/<>]+)`);
  const font = refRe.exec(raw)?.[1] ?? refRe2.exec(raw)?.[1] ?? "?";
  const toQ = pairs.filter(([, uni]) => uni === "?");
  const ligLike = pairs.filter(([, uni]) => ["ﬁ", "fl", "ﬀ", "ﬃ", "ﬄ"].includes(uni));
  if (toQ.length > 0 || ligLike.length > 0) {
    console.log(`CMap obj ${cmap.obj} font=${font} pairs=${pairs.length} -> "?" : ${toQ.length} ligatures: ${ligLike.length}`);
    for (const [code] of toQ.slice(0, 10)) console.log(`  ${hex(code)} -> "?"`);
    for (const [code, uni] of ligLike.slice(0, 10)) console.log(`  ${hex(code)} -> ${JSON.stringify(uni)}`);
  }
}
