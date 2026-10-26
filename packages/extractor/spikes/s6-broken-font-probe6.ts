// Spike BACKLOG-26 part 6: corpus-wide measurement of candidate signals.
// S-A: letter + à + letter (word-internal à — never legal in pt/en/fr/es).
// S-B: word-internal á per doc (legit in pt, rare in en — reported for contrast).
// S-C: lone "?" items and "? F" shapes (the alleged n4 math-symbol case).
// Plus: sofia ToUnicode coverage of the 0x80-0xFF window (WinAnsi fallback risk).
import { readFileSync } from "node:fs";
import { inflateSync, inflateRawSync } from "node:zlib";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const privateDir = process.env.CORPUS_PRIVATE_DIR ?? "<CORPUS_PRIVATE_DIR>";
const publicDir = path.join(import.meta.dirname, "../../../corpus/public");

const PRIVATE = [
  "n1-en-curinga",
  "n1-en-lostworld",
  "n1-en-sofia",
  "n1-pt-curinga",
  "n1-pt-sofia",
  "n2-en-astrofisica",
  "n2-pt-placasdevideo",
  "n3-en-filosofia",
  "n3-pt-filosofia",
  "n3-pt-filosofia2",
  "n4-en-astrofisica",
  "n4-en-fisica",
  "n4-pt-astrofisica",
] as const;
const PUBLIC = [
  "n1-en-rebus-philosophy-mind",
  "n2-en-arxiv-phobos",
  "n3-en-scielo-climatejustice",
  "n3-pt-scielo-wittgenstein",
] as const;

const WORD_INTERNAL_A_GRAVE = /[\p{L}]à[\p{L}]/gu;
const WORD_INTERNAL_A_ACUTE = /[\p{L}]á[\p{L}]/gu;

async function measure(id: string, filePath: string): Promise<void> {
  const bytes = new Uint8Array(readFileSync(filePath));
  const task = getDocument({ data: bytes, fontExtraProperties: true, verbosity: 0 });
  const pdf = await task.promise;
  const meta = (await pdf.getMetadata().catch(() => null)) as { info?: Record<string, unknown> } | null;
  let internalA = 0;
  let internalAacute = 0;
  let loneQ = 0;
  let qBeforeF = 0;
  const samplesA: string[] = [];
  const samplesAacute: string[] = [];
  const samplesQ: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items as Array<{ str: string }>).map((i) => i.str);
    const joined = items.join(" ");
    for (const m of joined.matchAll(WORD_INTERNAL_A_GRAVE)) {
      internalA += 1;
      if (samplesA.length < 6) {
        const at = m.index ?? 0;
        samplesA.push(joined.slice(Math.max(0, at - 12), at + m[0].length + 12));
      }
    }
    for (const m of joined.matchAll(WORD_INTERNAL_A_ACUTE)) {
      internalAacute += 1;
      if (samplesAacute.length < 6) {
        const at = m.index ?? 0;
        samplesAacute.push(joined.slice(Math.max(0, at - 12), at + m[0].length + 12));
      }
    }
    for (let i = 0; i < items.length; i++) {
      if (items[i].trim() === "?") {
        loneQ += 1;
        if (samplesQ.length < 4) samplesQ.push(`p${p}: ${items.slice(Math.max(0, i - 3), i + 4).join(" | ")}`);
      }
    }
    qBeforeF += (joined.match(/\?\s*F\s*[\s(]/g) ?? []).length;
    page.cleanup();
  }
  await task.destroy();
  const producer = String(meta?.info?.Producer ?? "?");
  console.log(
    `${id} producer=${JSON.stringify(producer)} internalAgrave=${internalA} internalAacute=${internalAacute} loneQuestion=${loneQ} questionBeforeF=${qBeforeF}`,
  );
  if (samplesA.length > 0) console.log(`  à samples: ${samplesA.map((s) => JSON.stringify(s)).join("; ")}`);
  if (samplesAacute.length > 0 && internalAacute <= 40) {
    console.log(`  á samples: ${samplesAacute.map((s) => JSON.stringify(s)).join("; ")}`);
  }
  if (samplesQ.length > 0 && id.startsWith("n4")) console.log(`  ? samples: ${samplesQ.join("; ")}`);
}

for (const id of PRIVATE) await measure(id, path.join(privateDir, `${id}.pdf`));
for (const id of PUBLIC) {
  try {
    await measure(id, path.join(publicDir, `${id}.pdf`));
  } catch (error) {
    console.log(`${id}: SKIP (${error instanceof Error ? error.message : String(error)})`);
  }
}

// ---------------------------------------------------------- sofia coverage ----
console.log("\n===== n1-pt-sofia: ToUnicode coverage of codes 0x00-0xFF (Palatino) =====");
{
  const bytes = readFileSync(path.join(privateDir, "n1-pt-sofia.pdf"));
  const raw = bytes.toString("latin1");
  const streamRe = /(\d+)\s+0\s+obj\b/g;
  let match: RegExpExecArray | null;
  while ((match = streamRe.exec(raw)) !== null) {
    const after = raw.slice(match.index, match.index + 800);
    const sm = /stream(\r\n|\r|\n)/.exec(after);
    if (!sm) continue;
    const start = match.index + sm.index + sm[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) continue;
    let text: string | null = null;
    for (const inflate of [inflateSync, inflateRawSync]) {
      try {
        const t = inflate(bytes.subarray(start, end)).toString("latin1");
        if (t.includes("begincmap")) {
          text = t;
          break;
        }
      } catch {
        // next
      }
    }
    if (!text) continue;
    const isPalatinoCMap = new RegExp(`/BaseFont\\s*/AAAAAA\\+PalatinoLTStd-Roman[\\s\\S]{0,2000}?/ToUnicode\\s+${match[1]}\\s+0\\s+R`).test(raw);
    if (!isPalatinoCMap) continue;
    const codes = new Set<number>();
    for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const pair of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
        codes.add(parseInt(pair[1], 16));
      }
    }
    for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const range of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*</g)) {
        const lo = parseInt(range[1], 16);
        const hi = parseInt(range[2], 16);
        for (let c = lo; c <= hi && c - lo < 512; c++) codes.add(c);
      }
    }
    const coveredHigh = [...codes].filter((c) => c >= 0x80 && c <= 0xff).sort((a, b) => a - b);
    const missingHigh: number[] = [];
    for (let c = 0x80; c <= 0xff; c++) if (!codes.has(c)) missingHigh.push(c);
    console.log(`Palatino CMap obj ${match[1]}: totalCodes=${codes.size}`);
    console.log(`  codes in 0x80-0xFF: ${coveredHigh.map((c) => c.toString(16)).join(",")}`);
    console.log(`  missing in 0x80-0xFF (${missingHigh.length}): ${missingHigh.slice(0, 40).map((c) => c.toString(16)).join(",")}${missingHigh.length > 40 ? "…" : ""}`);
  }
}
