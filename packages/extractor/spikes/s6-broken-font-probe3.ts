// Spike BACKLOG-26 part 3: dump the ToUnicode streams of n1-pt-sofia robustly.
import { readFileSync } from "node:fs";
import { inflateSync, inflateRawSync } from "node:zlib";
import path from "node:path";

const dir = process.env.CORPUS_PRIVATE_DIR ?? "<CORPUS_PRIVATE_DIR>";
const bytes = readFileSync(path.join(dir, "n1-pt-sofia.pdf"));
const raw = bytes.toString("latin1");

function hex(code: number): string {
  return "U+" + code.toString(16).toUpperCase().padStart(4, "0");
}

let streamCount = 0;
let cmapCount = 0;
const cmaps: Array<{ obj: string; text: string }> = [];
const streamRe = /(\d+)\s+0\s+obj\b/g;
let match: RegExpExecArray | null;
while ((match = streamRe.exec(raw)) !== null) {
  const after = raw.slice(match.index, match.index + 800);
  const sm = /stream(\r\n|\r|\n)/.exec(after);
  if (!sm) continue;
  streamCount += 1;
  const start = match.index + sm.index + sm[0].length;
  const end = raw.indexOf("endstream", start);
  if (end < 0) continue;
  const slice = bytes.subarray(start, end);
  for (const inflate of [inflateSync, inflateRawSync]) {
    try {
      const text = inflate(slice).toString("latin1");
      if (text.includes("begincmap")) {
        cmapCount += 1;
        cmaps.push({ obj: match[1], text });
      }
      break;
    } catch {
      // next flavor
    }
  }
}
console.log(`stream objects=${streamCount} cmap streams=${cmapCount}`);

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
  // Which fonts reference this CMap?
  const refRe = new RegExp(`/BaseFont\\s*/([^\\s/<>]+)[\\s\\S]{0,2000}?/ToUnicode\\s+${cmap.obj}\\s+0\\s+R`);
  const refRe2 = new RegExp(`/ToUnicode\\s+${cmap.obj}\\s+0\\s+R[\\s\\S]{0,2000}?/BaseFont\\s*/([^\\s/<>]+)`);
  const font = refRe.exec(raw)?.[1] ?? refRe2.exec(raw)?.[1] ?? "?";
  const interesting = pairs.filter(([, uni]) =>
    ["à", "á", "ﬁ", "fl", "ﬀ", "Ã", "æ", "?"].includes(uni),
  );
  console.log(`\nCMap obj ${cmap.obj} font=${font} pairs=${pairs.length} interesting=${interesting.length}`);
  for (const [code, uni] of interesting.slice(0, 15)) {
    console.log(`  ${hex(code)} -> ${JSON.stringify(uni)} (${[...uni].map((c) => hex(c.codePointAt(0) ?? 0)).join(" ")})`);
  }
}
