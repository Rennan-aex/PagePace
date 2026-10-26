// Spike BACKLOG-26 (exploratory): how do pdf.js and the PDF itself emit the
// swapped chars ("fi"->à in n1-pt-sofia, "?" for math symbols in n4)?
// Glyph level (operator list), font objects (commonObjs) and raw ToUnicode CMaps.
import { readFileSync } from "node:fs";
import { inflateSync, inflateRawSync } from "node:zlib";
import path from "node:path";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

const dir = process.env.CORPUS_PRIVATE_DIR ?? "<CORPUS_PRIVATE_DIR>";

function hex(code: number): string {
  return "U+" + code.toString(16).toUpperCase().padStart(4, "0");
}

// ---------------------------------------------------------------- raw PDF ----
// Minimal scanner: font dicts (/BaseFont + /ToUnicode ref + /Differences) and
// their ToUnicode CMaps (bfchar/bfrange), streams inflated with zlib.
interface RawFont {
  baseFont: string;
  toUnicodeRef: string | null;
  differences: string | null;
  mappingCount: number;
  interesting: string[];
}

function scanRawFonts(filePath: string, interestingUnicodes: number[]): RawFont[] {
  const bytes = readFileSync(filePath);
  const raw = bytes.toString("latin1");
  const fonts: RawFont[] = [];
  const dictRe = /(\d+)\s+0\s+obj\b([\s\S]{0,2000}?)endobj/g;
  const toUnicodeByRef = new Map<string, Map<number, number>>();
  let match: RegExpExecArray | null;
  // Pass 1: inflate every ToUnicode stream so pass 2 can resolve refs.
  const streamRe = /(\d+)\s+0\s+obj\b[\s\S]{0,800}?stream\r?\n/g;
  while ((match = streamRe.exec(raw)) !== null) {
    const objNum = match[1];
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) continue;
    const slice = bytes.subarray(start, end);
    for (const inflate of [inflateSync, inflateRawSync]) {
      try {
        const text = inflate(slice).toString("latin1");
        if (!text.includes("beginbfchar") && !text.includes("beginbfrange")) break;
        toUnicodeByRef.set(objNum, parseCMap(text));
        break;
      } catch {
        // not this flavor
      }
    }
  }
  // Pass 2: font dicts.
  while ((match = dictRe.exec(raw)) !== null) {
    const body = match[2];
    if (!body.includes("/BaseFont")) continue;
    const base = /\/BaseFont\s*\/([^\s/<>\[\]()]+)/.exec(body);
    if (!base) continue;
    const ref = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(body);
    const diffs = /\/Differences\s*\[([^\]]{0,400})\]/.exec(body);
    const map = ref ? toUnicodeByRef.get(ref[1]) : undefined;
    const interesting: string[] = [];
    if (map) {
      for (const [code, uni] of map) {
        if (interestingUnicodes.includes(uni)) {
          const glyphName = diffs ? findGlyphName(diffs[1], code) : null;
          interesting.push(
            `${hex(code)} -> ${hex(uni)} ${JSON.stringify(String.fromCodePoint(uni))}` +
              (glyphName ? ` (glyph name ${glyphName})` : ""),
          );
        }
      }
    }
    fonts.push({
      baseFont: base[1],
      toUnicodeRef: ref ? ref[1] : null,
      differences: diffs ? diffs[1].replace(/\s+/g, " ").trim().slice(0, 200) : null,
      mappingCount: map?.size ?? 0,
      interesting,
    });
  }
  return fonts;
}

/** First code point of a hex string destination (`<0066>` = "f", `<00660069>` = "fi"). */
function firstCodePoint(hexDigits: string): number {
  const unit = hexDigits.slice(0, 4);
  return parseInt(unit || "0", 16);
}

function parseCMap(text: string): Map<number, number> {
  // Maps charcode -> first code point of the destination; multi-char
  // destinations ("fi") keep only the first unit — enough to spot à/?.
  const map = new Map<number, number>();
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      map.set(parseInt(pair[1], 16), firstCodePoint(pair[2]));
    }
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const range of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      const lo = parseInt(range[1], 16);
      const hi = parseInt(range[2], 16);
      const dst = firstCodePoint(range[3]);
      for (let c = lo; c <= hi && c - lo < 512; c++) map.set(c, dst + (c - lo));
    }
  }
  return map;
}

function findGlyphName(differences: string, code: number): string | null {
  let current = -1;
  for (const token of differences.split(/\s+/)) {
    if (/^\d+$/.test(token)) {
      current = Number(token);
      continue;
    }
    const name = token.replace(/^\//, "");
    if (current === code) return name;
    current += 1;
  }
  return null;
}

// ---------------------------------------------------------------- pdf.js ----
async function deepDive(file: string, needles: string[]) {
  const filePath = path.join(dir, file);
  const bytes = new Uint8Array(readFileSync(filePath));
  const task = getDocument({ data: bytes, fontExtraProperties: true, verbosity: 0 });
  const pdf = await task.promise;
  const meta = (await pdf.getMetadata().catch(() => null)) as { info?: Record<string, unknown> } | null;
  console.log(`\n===== ${file} pages=${pdf.numPages} producer=${meta?.info?.Producer ?? "?"} =====`);

  const needlePages = new Map<string, number>();
  for (let p = 1; p <= pdf.numPages && needlePages.size < needles.length; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const text = content.items.map((i: unknown) => (i as { str?: string }).str ?? "").join("");
    for (const n of needles) if (!needlePages.has(n) && text.includes(n)) needlePages.set(n, p);
    page.cleanup();
  }
  console.log("needle -> first page:", [...needlePages]);

  const page1 = [...needlePages.values()][0];
  if (!page1) {
    await task.destroy();
    return;
  }
  const page = await pdf.getPage(page1);
  await page.getOperatorList(); // resolve fonts into commonObjs

  // Only the chars the spike is about: à, á, ? and the real ligatures.
  const targets = new Set([0xe0, 0xe1, 0x3f, 0xfb01, 0xfb02]);
  const ops = await page.getOperatorList();
  let currentFont = "?";
  const seen = new Map<string, { font: string; count: number; charcode: number; keys: string[] }>();
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] as unknown[];
    if (fn === OPS.setFont) {
      currentFont = String(args[0]);
      continue;
    }
    if (fn !== OPS.showText) continue;
    const glyphs = args[0] as Array<Record<string, unknown>>;
    for (const glyph of glyphs) {
      const uni = String(glyph.unicode ?? "");
      const cp = uni.codePointAt(0) ?? 0;
      if (!targets.has(cp)) continue;
      const charcode = Number(glyph.originalCharCode ?? -1);
      const key = `${currentFont}|${charcode}|${cp}`;
      const entry = seen.get(key) ?? {
        font: currentFont,
        count: 0,
        charcode,
        keys: Object.keys(glyph).sort(),
      };
      entry.count += 1;
      seen.set(key, entry);
    }
  }
  console.log("target glyphs (operator list):");
  for (const g of seen.values()) {
    const font = page.commonObjs.get(g.font) as Record<string, unknown> | undefined;
    console.log(
      `  font=${g.font} realName=${String(font?.name ?? "?")} charcode=${hex(g.charcode)} count=${g.count} keys=[${g.keys.join(",")}]`,
    );
    const uni = font?.toUnicode as { charCodeToUnicode?: Map<number, string> } | undefined;
    const cmap = uni?.charCodeToUnicode;
    if (cmap instanceof Map) {
      const mapped = cmap.get(g.charcode);
      console.log(
        `    font.toUnicode: size=${cmap.size} charcode->${mapped ? `${JSON.stringify(mapped)} ${[...mapped].map((c) => hex(c.codePointAt(0) ?? 0)).join("+")}` : "MISSING"}`,
      );
    } else {
      console.log(`    font.toUnicode: ${font && "toUnicode" in font ? typeof font.toUnicode : "absent"}`);
    }
  }
  page.cleanup();

  // What did the producer write? (raw CMap scan)
  const rawFonts = scanRawFonts(filePath, [...targets, 0xfb01, 0xfb02, 0x3f]);
  console.log("raw fonts with interesting mappings:");
  for (const f of rawFonts) {
    if (f.interesting.length === 0 && f.mappingCount === 0 && !f.toUnicodeRef) continue;
    console.log(
      `  ${f.baseFont} toUnicodeRef=${f.toUnicodeRef ?? "-"} mappings=${f.mappingCount}` +
        (f.differences ? ` differences=[${f.differences}]` : ""),
    );
    for (const line of f.interesting.slice(0, 12)) console.log(`    ${line}`);
  }
  await task.destroy();
}

await deepDive("n1-pt-sofia.pdf", ["Soàa", "ànal", "áoresciam"]);
await deepDive("n4-pt-astrofisica.pdf", ["F (d) ? F (R)"]);
