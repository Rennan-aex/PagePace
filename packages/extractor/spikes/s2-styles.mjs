#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const corpusDir = process.env.CORPUS_PRIVATE_DIR ?? "<CORPUS_PRIVATE_DIR>";
const outDir = path.join(repoRoot, ".pagepace-cache", "spikes", "S2");
const pdfjsRoot = path.join(repoRoot, "node_modules", "pdfjs-dist");
const toDataPath = (dir) => dir.replace(/\\/g, "/").replace(/\/+$/, "") + "/";

const defaultIds = [
  "n1-pt-sofia",
  "n1-en-sofia",
  "n1-pt-curinga",
  "n1-en-curinga",
  "n1-en-lostworld",
  "n2-en-astrofisica",
  "n2-pt-placasdevideo",
  "n3-pt-filosofia",
  "n3-pt-filosofia2",
  "n3-en-filosofia",
  "n4-en-astrofisica",
  "n4-en-fisica",
  "n4-pt-astrofisica",
  "n5-en-newton",
  "n5-pt-astrofisica",
];
const ids = process.argv.slice(2).length > 0 ? process.argv.slice(2) : defaultIds;

// PDFs escaneados com camada de OCR embutida (todo o texto em `Tr 3`, invisível;
// feature `scanned-ocr-layer` no manifest — ADR-019). O relatório S2 agrega os
// grupos separados: texto digital nativo × texto de OCR embutido.
const OCR_LAYER_IDS = new Set(["n1-en-lostworld", "n3-en-filosofia"]);

const PDFJS_PARAMS = {
  standardFontDataUrl: toDataPath(path.join(pdfjsRoot, "standard_fonts")),
  cMapUrl: toDataPath(path.join(pdfjsRoot, "cmaps")),
  cMapPacked: true,
  wasmUrl: toDataPath(path.join(pdfjsRoot, "wasm")),
  isEvalSupported: false,
  fontExtraProperties: true,
};

const SUBSET_RE = /^[A-Z]{6}\+/;
const warnings = [];
console.warn = (...args) => {
  warnings.push(args.join(" "));
};
const DIGITS_RE = /\d+$/;
const BOLD_WORDS = new Set([
  "bold", "boldmt", "bd", "black", "heavy", "demi", "demibold", "semibold",
  "extrabold", "ultrabold", "superbold", "cmssbx",
]);
const ITALIC_WORDS = new Set(["italic", "ital", "oblique", "obl", "slanted", "slant", "cursive", "it"]);
const REGULAR_WORDS = new Set([
  "roman", "regu", "regular", "normal", "mt", "psmt", "std", "text", "book",
  "base", "rom", "reg", "mt",
]);
const LIGHT_WORDS = new Set(["light", "thin", "narrow", "cond", "condensed"]);
const MEDIUM_WORDS = new Set(["medium", "medi", "mediummt"]);
const VOWEL_RE = /[aeiouy]/i;

const CONVENTION_RULES = [
  [/^CMBX\d/i, { bold: true, italic: false, kind: "text", family: "Computer Modern", role: "bold" }],
  [/^CMB\d/i, { bold: true, italic: false, kind: "text", family: "Computer Modern", role: "bold" }],
  [/^CMTI\d/i, { bold: false, italic: true, kind: "text", family: "Computer Modern", role: "italic" }],
  [/^CMSL\d/i, { bold: false, italic: true, kind: "text", family: "Computer Modern", role: "italic" }],
  [/^CMSSBX\d/i, { bold: true, italic: false, kind: "text", family: "Computer Modern", role: "bold" }],
  [/^CMSSB\d/i, { bold: true, italic: false, kind: "text", family: "Computer Modern", role: "bold" }],
  [/^CMSSI\d/i, { bold: false, italic: true, kind: "text", family: "Computer Modern", role: "italic" }],
  [/^CMSS\d/i, { bold: false, italic: false, kind: "text", family: "Computer Modern", role: "regular" }],
  [/^CMTT\d/i, { bold: false, italic: false, kind: "text", family: "Computer Modern", role: "regular" }],
  [/^CMR\d/i, { bold: false, italic: false, kind: "text", family: "Computer Modern", role: "regular" }],
  [/^CMMI\d/i, { bold: false, italic: true, kind: "math", family: "Computer Modern", role: "math-italic" }],
  [/^CMSY\d/i, { bold: null, italic: null, kind: "symbol", family: "Computer Modern", role: "symbols" }],
  [/^CMEX\d/i, { bold: null, italic: null, kind: "symbol", family: "Computer Modern", role: "symbols" }],
  [/^CMSC\d/i, { bold: null, italic: null, kind: "symbol", family: "Computer Modern", role: "symbols" }],
  [/^CMU\d/i, { bold: null, italic: null, kind: "symbol", family: "Computer Modern", role: "symbols" }],
  [/^SFRM\d/, { bold: false, italic: false, kind: "text", family: "SF", role: "regular" }],
  [/^SFBX\d/, { bold: true, italic: false, kind: "text", family: "SF", role: "bold" }],
  [/^SFTI\d/, { bold: false, italic: true, kind: "text", family: "SF", role: "italic" }],
  [/^SFTT\d/, { bold: false, italic: false, kind: "text", family: "SF", role: "typewriter" }],
  [/^SFCC\d/, { bold: false, italic: false, kind: "text", family: "SF", role: "small-caps" }],
  [/^SFSX\d/, { bold: false, italic: false, kind: "text", family: "SF", role: "sans" }],
  [/^SFMI\d/, { bold: false, italic: true, kind: "math", family: "SF", role: "math-italic" }],
  [/^SF(?:SY|EX)\d/, { bold: null, italic: null, kind: "symbol", family: "SF", role: "symbols" }],
  [/^(t1x|rtx|tx)r$/, { bold: false, italic: false, kind: "text", family: "$1", role: "regular" }],
  [/^(t1x|rtx|tx)b$/, { bold: true, italic: false, kind: "text", family: "$1", role: "bold" }],
  [/^(t1x|rtx|tx)i$/, { bold: false, italic: true, kind: "text", family: "$1", role: "italic" }],
  [/^(t1x|rtx|tx)bi$/, { bold: true, italic: true, kind: "text", family: "$1", role: "bold-italic" }],
  [/^(t1x|rtx|tx)bmi$/, { bold: true, italic: true, kind: "math", family: "$1", role: "bold-math-italic" }],
  [/^(t1x|rtx|tx)mi$/, { bold: false, italic: true, kind: "math", family: "$1", role: "math-italic" }],
  [/^(t1x|rtx|tx)tt$/, { bold: false, italic: false, kind: "text", family: "$1", role: "typewriter" }],
  [/^(t1x|rtx|tx)btt$/, { bold: true, italic: false, kind: "text", family: "$1", role: "bold-typewriter" }],
  [/^(t1x|rtx|tx)(?:sy|ex)$/, { bold: null, italic: null, kind: "symbol", family: "$1", role: "symbols" }],
];

const SYMBOL_FAMILIES = /^(Symbol|ZapfDingbats|Dingbats|Marlett)/i;

function histogram(values) {
  const map = new Map();
  for (const value of values) map.set(String(value), (map.get(String(value)) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function latin1(bytes, offset = 0, length = bytes.length - offset) {
  let out = "";
  for (let i = offset; i < offset + length && i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function utf16be(bytes) {
  let out = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
  return out.replace(/\u0000/g, "");
}

function splitTokens(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+|\s+/)
    .filter(Boolean);
}

function stripSubset(name) {
  return name.replace(SUBSET_RE, "");
}

function familyPlausible(name) {
  return splitTokens(name.replace(DIGITS_RE, "")).some(
    (token) => token.length >= 3 && VOWEL_RE.test(token) && /[A-Za-z]/.test(token),
  );
}

function conventionOf(name) {
  for (const [re, style] of CONVENTION_RULES) {
    const match = name.match(re);
    if (!match) continue;
    const family = typeof style.family === "string" && style.family.includes("$1") ? style.family.replace("$1", match[1]) : style.family;
    return { basis: "convention", ...style, family };
  }
  if (SYMBOL_FAMILIES.test(name)) {
    return { basis: "convention", bold: null, italic: null, kind: "symbol", family: name.replace(DIGITS_RE, ""), role: "symbols" };
  }
  return null;
}

function classifyName(rawName, useConvention = true) {
  const name = stripSubset(rawName);
  const conv = useConvention ? conventionOf(name) : null;
  if (conv) return { name, ...conv, weight: null };

  const tokens = splitTokens(name).map((token) => token.toLowerCase());
  const has = (set) => tokens.some((token) => set.has(token));
  let bold = null;
  let italic = null;
  let weight = null;
  let basis = "unknown";

  if (has(BOLD_WORDS)) {
    bold = true;
    weight = "bold";
    basis = "token";
  } else if (has(MEDIUM_WORDS)) {
    weight = "medium";
    basis = "token";
  } else if (has(LIGHT_WORDS)) {
    bold = false;
    weight = "light";
    basis = "token";
  } else if (has(REGULAR_WORDS)) {
    bold = false;
    weight = "regular";
    basis = "token";
  }
  if (has(ITALIC_WORDS)) {
    italic = true;
    basis = "token";
  } else if (italic === null && basis === "token") {
    italic = false;
  }

  if ((bold === null || italic === null) && familyPlausible(name)) {
    if (bold === null) {
      bold = false;
      if (weight === null) weight = "regular";
    }
    if (italic === null) italic = false;
    if (basis === "unknown") basis = "default";
  }

  const family = splitTokens(name)
    .filter((token) => !BOLD_WORDS.has(token.toLowerCase()) && !ITALIC_WORDS.has(token.toLowerCase()))
    .filter((token) => !REGULAR_WORDS.has(token.toLowerCase()) && !LIGHT_WORDS.has(token.toLowerCase()) && !MEDIUM_WORDS.has(token.toLowerCase()))
    .filter((token) => !/^\d+$/.test(token))
    .join(" ");

  return {
    name,
    bold,
    italic,
    weight,
    kind: "text",
    basis,
    family: family || name,
    opaque: bold === null && italic === null,
  };
}

function detectFormat(bytes) {
  if (!bytes || bytes.length < 4) return "empty";
  const tag = latin1(bytes, 0, 4);
  if (bytes[0] === 0x80 && bytes[1] === 0x01) return "type1-pfb";
  if (bytes[0] === 0x25 && bytes[1] === 0x21) return "type1-pfa";
  if (tag === "OTTO" || tag === "true" || tag === "\u0000\u0001\u0000\u0000") return "sfnt";
  if (tag === "ttcf") return "ttc";
  if (tag === "wOFF" || tag === "wOF2") return "woff";
  return "unknown";
}

function pfbPayload(bytes) {
  const parts = [];
  let i = 0;
  while (i + 6 <= bytes.length && bytes[i] === 0x80) {
    const type = bytes[i + 1];
    const length = bytes[i + 2] | (bytes[i + 3] << 8) | (bytes[i + 4] << 16) | (bytes[i + 5] << 24);
    i += 6;
    if (type === 0x01 || type === 0x02) parts.push(bytes.subarray(i, i + length));
    i += length;
    if (type === 0x03) break;
  }
  let total = 0;
  for (const part of parts) total += part.length;
  const joined = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    joined.set(part, at);
    at += part.length;
  }
  return joined;
}

function firstMatch(text, re, group = 1) {
  const m = text.match(re);
  return m ? m[group] : null;
}

function type1Style(bytes) {
  const payload = detectFormat(bytes) === "type1-pfb" ? pfbPayload(bytes) : bytes;
  const text = latin1(payload);
  const eexecAt = text.indexOf("eexec");
  const header = eexecAt >= 0 ? text.slice(0, eexecAt) : text.slice(0, 8000);
  const fontName = firstMatch(header, /\/FontName\s+\/([^\s/]+)/);
  const fullName = firstMatch(header, /\/FullName\s+\(([^)]*)\)/) ?? firstMatch(header, /\/FullName\s+\/([^\s/]+)/);
  const family = firstMatch(header, /\/FamilyName\s+\(([^)]*)\)/) ?? firstMatch(header, /\/FamilyName\s+\/([^\s/]+)/);
  const weight = firstMatch(header, /\/Weight\s+\/([^\s/]+)/);
  const angleRaw = firstMatch(header, /\/ItalicAngle\s+(-?\d+(?:\.\d+)?)/);
  const angle = angleRaw === null ? null : Number(angleRaw);
  const styleText = `${fontName ?? ""} ${fullName ?? ""} ${weight ?? ""}`;
  const bold = /bold|black|heavy|demi|semibold/i.test(styleText) ? true : /regular|roman|book|light|medium/i.test(styleText) ? false : null;
  const italic = angle !== null && angle !== 0 ? true : /italic|oblique/i.test(styleText) ? true : bold !== null ? false : null;
  return {
    format: "type1",
    fontName,
    fullName,
    family,
    weight,
    italicAngle: angle,
    bold,
    italic,
    source: "FontInfo",
  };
}

function sfntStyle(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = view.getUint16(4);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const at = 12 + i * 16;
    if (at + 16 > bytes.length) break;
    tables[latin1(bytes, at, 4)] = { offset: view.getUint32(at + 8), length: view.getUint32(at + 12) };
  }
  const out = { format: "sfnt", sfnt: latin1(bytes, 0, 4), family: null, subfamily: null, full: null, weightClass: null, fsSelection: null, macStyle: null };
  const nameTable = tables.name;
  if (nameTable && nameTable.offset + 6 <= bytes.length) {
    const base = nameTable.offset;
    const count = view.getUint16(base + 2);
    const stringsAt = base + view.getUint16(base + 4);
    const wanted = new Map([
      [1, "family"],
      [2, "subfamily"],
      [4, "full"],
      [16, "typoFamily"],
      [17, "typoSubfamily"],
    ]);
    const found = new Map();
    for (let i = 0; i < count; i++) {
      const rec = base + 6 + i * 12;
      if (rec + 12 > bytes.length) break;
      const platform = view.getUint16(rec);
      const language = view.getUint16(rec + 4);
      const nameId = view.getUint16(rec + 6);
      const length = view.getUint16(rec + 8);
      const offset = view.getUint16(rec + 10);
      if (!wanted.has(nameId)) continue;
      const start = stringsAt + offset;
      if (start + length > bytes.length) continue;
      const raw = bytes.subarray(start, start + length);
      const value = (platform === 0 || platform === 3 ? utf16be(raw) : latin1(raw)).trim();
      if (!value) continue;
      const key = wanted.get(nameId);
      const preferred = platform === 3 && language === 0x409;
      if (!found.has(key) || preferred) found.set(key, { value, preferred: preferred || found.get(key)?.preferred === true });
    }
    for (const [key, entry] of found) out[key] = entry.value;
  }
  const os2 = tables["OS/2"];
  if (os2 && os2.offset + 64 <= bytes.length) {
    out.weightClass = view.getUint16(os2.offset + 4);
    out.fsSelection = view.getUint16(os2.offset + 62);
  }
  const head = tables.head;
  if (head && head.offset + 46 <= bytes.length) out.macStyle = view.getUint16(head.offset + 44);

  const styleText = `${out.subfamily ?? ""} ${out.full ?? ""} ${out.family ?? ""}`;
  let bold = null;
  if (out.fsSelection !== null && out.fsSelection & 0x20) bold = true;
  else if (out.macStyle !== null && out.macStyle & 1) bold = true;
  else if (bold === null && out.weightClass !== null && out.weightClass >= 700) bold = true;
  else if (out.fsSelection !== null || out.macStyle !== null || out.weightClass !== null) bold = false;
  if (bold !== true && /bold|black|heavy|demi|semibold/i.test(styleText)) bold = true;

  let italic = null;
  if (out.fsSelection !== null && out.fsSelection & 1) italic = true;
  else if (out.macStyle !== null && out.macStyle & 2) italic = true;
  else if (out.fsSelection !== null || out.macStyle !== null) italic = false;
  if (italic !== true && /italic|oblique/i.test(styleText)) italic = true;

  return {
    format: "sfnt",
    sfnt: out.sfnt,
    family: out.typoFamily ?? out.family,
    subfamily: out.typoSubfamily ?? out.subfamily,
    full: out.full,
    weightClass: out.weightClass,
    fsSelection: out.fsSelection,
    macStyle: out.macStyle,
    bold,
    italic,
    source: "name/OS2",
  };
}

function styleFromBytes(bytes) {
  const format = detectFormat(bytes);
  if (format === "sfnt") {
    try {
      return sfntStyle(bytes);
    } catch {
      return { format, bold: null, italic: null, source: "error" };
    }
  }
  if (format === "type1-pfb" || format === "type1-pfa") {
    try {
      return type1Style(bytes);
    } catch {
      return { format, bold: null, italic: null, source: "error" };
    }
  }
  return { format, bold: null, italic: null, source: null };
}

function styleCode(style) {
  const bold = style.bold === true ? "B" : style.bold === false ? "b" : "?";
  const italic = style.italic === true ? "I" : style.italic === false ? "i" : "?";
  return `${bold}${italic}`;
}

function isShear(matrix) {
  if (!Array.isArray(matrix) || matrix.length < 4) return false;
  const [a, b, c, d] = matrix;
  const norm = Math.hypot(a, b) * Math.hypot(c, d);
  if (norm < 1e-12) return false;
  return Math.abs((a * c + b * d) / norm) > 0.01;
}

function isRotated(matrix) {
  if (!Array.isArray(matrix) || matrix.length < 4) return false;
  return Math.abs(matrix[1]) > 0.5;
}

function newFont(ref) {
  return {
    ref,
    rawName: null,
    nameStyle: null,
    naiveStyle: null,
    pdfjsFlags: { bold: undefined, italic: undefined },
    type3: false,
    bytes: null,
    usage: { items: 0, chars: 0, letters: 0, pages: 0 },
    locate: [],
    locateDraw: [],
    draw: { tr: {}, skewChars: 0, rotatedChars: 0, contourChars: 0, strokeChars: 0, invisibleChars: 0, lineWidths: {}, stringOps: 0, glyphOps: 0 },
    widths: { letters: {}, digits: {}, lettersMean: null, digitsMean: null },
    _pages: new Set(),
    _widths: { letters: new Map(), digits: new Map() },
  };
}

function meanOf(list) {
  if (list.length === 0) return null;
  return Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 100) / 100;
}

function finalizeWidths(font) {
  font.widths.letters = Object.fromEntries(
    [...font._widths.letters.entries()].map(([ch, list]) => [ch, meanOf(list)]),
  );
  font.widths.digits = Object.fromEntries(
    [...font._widths.digits.entries()].map(([ch, list]) => [ch, meanOf(list)]),
  );
  font.widths.lettersMean = meanOf(Object.values(font.widths.letters));
  font.widths.digitsMean = meanOf(Object.values(font.widths.digits));
  delete font._widths;
  font.usage.pages = font._pages.size;
  delete font._pages;
}

async function resolveFontObject(page, font) {
  let obj = null;
  try {
    obj = page.commonObjs.get(font.ref);
  } catch {
    obj = null;
  }
  if (!obj || obj instanceof Error) {
    font.rawName = font.rawName ?? "(unresolved)";
    return;
  }
  font.rawName = typeof obj.name === "string" && obj.name ? obj.name : font.rawName ?? "(no name)";
  font.pdfjsFlags = { bold: obj.bold, italic: obj.italic };
  font.type3 = obj.isType3Font === true;
  if (!font.type3 && obj.data instanceof Uint8Array) font.bytes = styleFromBytes(obj.data);
  if (!font.nameStyle) font.nameStyle = classifyName(font.rawName);
  if (!font.naiveStyle) font.naiveStyle = classifyName(font.rawName, false);
}

async function inspectPdf(id) {
  const file = path.join(corpusDir, `${id}.pdf`);
  const data = new Uint8Array(await readFile(file));
  const task = getDocument({ ...PDFJS_PARAMS, data });
  const pdf = await task.promise;
  const totalPages = pdf.numPages;
  const fonts = new Map();
  const ensure = (ref) => {
    if (typeof ref !== "string") return null;
    if (!fonts.has(ref)) fonts.set(ref, newFont(ref));
    return fonts.get(ref);
  };
  const totals = {
    pages: totalPages,
    pagesWithText: 0,
    items: 0,
    chars: 0,
    letters: 0,
    textObjectOps: 0,
    trModes: {},
    shearedGlyphs: 0,
    rotatedGlyphs: 0,
    contourGlyphs: 0,
  };

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const items = textContent.items.filter((item) => typeof item.str === "string");
    if (items.length > 0) totals.pagesWithText += 1;
    for (const item of items) {
      const font = ensure(item.fontName);
      if (!font) continue;
      const letters = item.str.match(/\p{L}/gu)?.length ?? 0;
      font.usage.items += 1;
      font.usage.chars += item.str.length;
      font.usage.letters += letters;
      font._pages.add(pageNum);
      if (font.locate.length < 3 && item.str.trim() !== "") {
        font.locate.push({
          page: pageNum,
          str: item.str.slice(0, 24),
          x: Math.round(item.transform[4]),
          y: Math.round(item.transform[5]),
          h: Math.round(item.height),
        });
      }
      totals.items += 1;
      totals.chars += item.str.length;
      totals.letters += letters;
      if (isShear(item.transform)) totals.shearedGlyphs += 1;
      else if (isRotated(item.transform)) totals.rotatedGlyphs += 1;
    }

    const ops = await page.getOperatorList();
    let currentFont = null;
    let currentSize = 0;
    let tr = 0;
    let matrix = [1, 0, 0, 1, 0, 0];
    let lineWidth = 1;
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i];
      if (fn === OPS.setFont) {
        currentFont = typeof args[0] === "string" ? args[0] : currentFont;
        currentSize = typeof args[1] === "number" ? args[1] : currentSize;
        continue;
      }
      if (fn === OPS.setTextRenderingMode) {
        tr = args[0];
        totals.trModes[String(tr)] = (totals.trModes[String(tr)] ?? 0) + 1;
        continue;
      }
      if (fn === OPS.setTextMatrix) {
        matrix = args[0];
        continue;
      }
      if (fn === OPS.setLineWidth) {
        lineWidth = args[0];
        continue;
      }
      const isShowText =
        fn === OPS.showText || fn === OPS.showSpacedText || fn === OPS.nextLineShowText || fn === OPS.nextLineSetSpacingShowText;
      if (!isShowText) continue;
      totals.textObjectOps += 1;
      const font = ensure(currentFont);
      if (!font) continue;
      const payload = args[0];
      const glyphs = Array.isArray(payload) ? payload : null;
      const charCount = glyphs ? glyphs.length : typeof payload === "string" ? payload.length : 0;
      if (glyphs) font.draw.glyphOps += 1;
      else font.draw.stringOps += 1;
      font.draw.tr[String(tr)] = (font.draw.tr[String(tr)] ?? 0) + charCount;
      const visible = tr !== 3;
      if (!visible) font.draw.invisibleChars += charCount;
      if (visible && (tr === 2 || tr === 5 || tr === 6)) font.draw.contourChars += charCount;
      else if (visible && tr !== 0) font.draw.strokeChars += charCount;
      const shear = isShear(matrix);
      if (visible && shear) font.draw.skewChars += charCount;
      else if (isRotated(matrix)) font.draw.rotatedChars += charCount;
      if (visible && tr !== 0) {
        const key = String(Math.round(lineWidth * 1000) / 1000);
        font.draw.lineWidths[key] = (font.draw.lineWidths[key] ?? 0) + charCount;
      }
      const hasStyleSignal = visible && (tr !== 0 || shear);
      if (hasStyleSignal && font.locateDraw.length < 3) {
        font.locateDraw.push({
          page: pageNum,
          tr,
          shear,
          x: Math.round(matrix[4]),
          y: Math.round(matrix[5]),
          size: Math.round(currentSize * 10) / 10,
        });
      }
      if (!glyphs) continue;
      for (const glyph of glyphs) {
        const unicode = typeof glyph.unicode === "string" ? glyph.unicode : "";
        if (typeof glyph.width !== "number") continue;
        if (/^[a-z]$/.test(unicode)) {
          if (!font._widths.letters.has(unicode)) font._widths.letters.set(unicode, []);
          font._widths.letters.get(unicode).push(glyph.width);
        } else if (/^[0-9]$/.test(unicode)) {
          if (!font._widths.digits.has(unicode)) font._widths.digits.set(unicode, []);
          font._widths.digits.get(unicode).push(glyph.width);
        }
      }
    }

    for (const font of fonts.values()) {
      if (font.rawName === null) await resolveFontObject(page, font);
    }
    page.cleanup();
  }

  await task.destroy().catch(() => {});
  for (const font of fonts.values()) finalizeWidths(font);

  const list = [...fonts.values()].map((font) => ({ ...font, ref: font.ref }));
  const letterFonts = list.filter((font) => font.usage.letters > 0 && font.nameStyle?.kind !== "symbol");
  const textFonts = letterFonts.filter((font) => font.nameStyle?.kind !== "math");
  const decided = textFonts.filter((font) => font.nameStyle.bold !== null && font.nameStyle.italic !== null);
  const naiveDecided = textFonts.filter((font) => font.nameStyle.basis !== "unknown" && font.nameStyle.basis !== "convention");
  const unknown = textFonts.filter((font) => font.nameStyle.bold === null && font.nameStyle.italic === null);
  const conflicts = [];
  for (const font of list) {
    if (!font.bytes || !font.nameStyle) continue;
    for (const axis of ["bold", "italic"]) {
      const fromName = font.nameStyle[axis];
      const fromBytes = font.bytes[axis];
      if (fromName !== null && fromBytes !== null && fromName !== fromBytes) {
        conflicts.push({ ref: font.ref, name: font.rawName, axis, fromName, fromBytes, bytes: font.bytes });
      }
    }
  }
  const unresolvedBytes = list.filter((font) => font.bytes && font.bytes.bold === null && font.bytes.italic === null);
  const faux = list.filter((font) => font.draw.contourChars > 0 || font.draw.skewChars > 0);

  const byFamily = new Map();
  for (const font of textFonts) {
    const key = font.nameStyle.family.toLowerCase();
    if (!byFamily.has(key)) byFamily.set(key, []);
    byFamily.get(key).push(font);
  }
  const widthPairs = [];
  for (const [family, group] of byFamily) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const shared = Object.keys(a.widths.letters).filter((ch) => ch in b.widths.letters);
        if (shared.length < 3) continue;
        const ratios = shared.map((ch) => b.widths.letters[ch] / a.widths.letters[ch]);
        const ratio = ratios.reduce((x, y) => x + y, 0) / ratios.length;
        widthPairs.push({
          family,
          a: a.rawName,
          b: b.rawName,
          aStyle: styleCode(a.nameStyle),
          bStyle: styleCode(b.nameStyle),
          ratio: Math.round(ratio * 1000) / 1000,
          sharedLetters: shared.length,
        });
      }
    }
  }

  return {
    id,
    file: path.basename(file),
    numPages: totalPages,
    totals,
    counts: {
      fonts: list.length,
      letterFonts: letterFonts.length,
      textFonts: textFonts.length,
      decided: decided.length,
      naiveDecided: naiveDecided.length,
      unknown: unknown.length,
      conflicts: conflicts.length,
      unresolvedBytes: unresolvedBytes.length,
      faux: faux.length,
      withBytes: list.filter((font) => font.bytes).length,
    },
    formats: histogram(list.map((font) => font.bytes?.format ?? (font.type3 ? "type3" : "none"))),
    conflicts,
    unknown: unknown.map((font) => ({ ref: font.ref, name: font.rawName, letters: font.usage.letters, basis: font.nameStyle.basis, locate: font.locate })),
    faux: faux.map((font) => ({
      ref: font.ref,
      name: font.rawName,
      contourChars: font.draw.contourChars,
      skewChars: font.draw.skewChars,
      tr: font.draw.tr,
      lineWidths: font.draw.lineWidths,
      letters: font.usage.letters,
      style: font.nameStyle,
      locateDraw: font.locateDraw,
    })),
    unresolvedBytes: unresolvedBytes.map((font) => ({ ref: font.ref, name: font.rawName, format: font.bytes.format })),
    widthPairs: widthPairs.sort((x, y) => Math.abs(y.ratio - 1) - Math.abs(x.ratio - 1)),
    fonts: list,
  };
}

function digestLine(result) {
  const c = result.counts;
  return [
    result.id.padEnd(20),
    `pages=${String(result.numPages).padStart(4)}`,
    `fonts=${String(c.fonts).padStart(3)}`,
    `text=${String(c.textFonts).padStart(3)}`,
    `decided=${String(c.decided).padStart(3)}`,
    `unknown=${String(c.unknown).padStart(3)}`,
    `conflict=${String(c.conflicts).padStart(3)}`,
    `faux=${String(c.faux).padStart(3)}`,
    `bytes=${String(c.withBytes).padStart(3)}`,
    `shear=${result.totals.shearedGlyphs}`,
    `rot=${result.totals.rotatedGlyphs}`,
    `tr=${JSON.stringify(result.totals.trModes)}`,
  ].join(" ");
}

// Papéis de estilo que o token/default não tem como adivinhar: se a convenção
// diz typewriter/sans/small-caps e o naive diz "texto comum", o erro é de PAPEL.
const PAPER_ROLES = new Set(["typewriter", "sans", "small-caps"]);

// Erros do naive (sem a tabela de convenções) medidos em letras de texto.
// Categorias disjuntas por construção: papel só conta quando não é erro de
// negrito/itálico; uma fonte com erro conta 1x no total.
function naiveErrorsOf(results) {
  const out = {
    bold: { letters: 0, fonts: 0 },
    italic: { letters: 0, fonts: 0 },
    paper: { letters: 0, fonts: 0 },
    total: { letters: 0, fonts: 0 },
  };
  for (const result of results) {
    for (const font of result.fonts) {
      if (!font.usage.letters) continue;
      const truth = font.nameStyle;
      if (!truth || truth.kind !== "text") continue;
      const naive = font.naiveStyle ?? classifyName(font.rawName, false);
      const boldErr = truth.bold === true && naive.bold !== true;
      const italicErr = truth.italic === true && naive.italic !== true;
      const paperErr =
        PAPER_ROLES.has(truth.role) &&
        !PAPER_ROLES.has(naive.role ?? "regular") &&
        !boldErr &&
        !italicErr;
      if (boldErr) {
        out.bold.letters += font.usage.letters;
        out.bold.fonts += 1;
      }
      if (italicErr) {
        out.italic.letters += font.usage.letters;
        out.italic.fonts += 1;
      }
      if (paperErr) {
        out.paper.letters += font.usage.letters;
        out.paper.fonts += 1;
      }
      if (boldErr || italicErr || paperErr) {
        out.total.letters += font.usage.letters;
        out.total.fonts += 1;
      }
    }
  }
  return out;
}

// Composição real (verdade, com a tabela de convenções) em letras de texto.
// `bold` e `italic` são contagens independentes (uma fonte bold-italic entra
// nas duas) — mesma definição da §2/§5 do relatório S2.
function compositionOf(results) {
  const out = {
    bold: { letters: 0, fonts: 0 },
    italic: { letters: 0, fonts: 0 },
    regular: { letters: 0, fonts: 0 },
    mathLetters: 0,
    symbolLetters: 0,
  };
  for (const result of results) {
    for (const font of result.fonts) {
      if (!font.usage.letters || !font.nameStyle) continue;
      if (font.nameStyle.kind === "math") {
        out.mathLetters += font.usage.letters;
        continue;
      }
      if (font.nameStyle.kind === "symbol") {
        out.symbolLetters += font.usage.letters;
        continue;
      }
      if (font.nameStyle.bold === true) {
        out.bold.letters += font.usage.letters;
        out.bold.fonts += 1;
      }
      if (font.nameStyle.italic === true) {
        out.italic.letters += font.usage.letters;
        out.italic.fonts += 1;
      }
      if (font.nameStyle.bold !== true && font.nameStyle.italic !== true) {
        out.regular.letters += font.usage.letters;
        out.regular.fonts += 1;
      }
    }
  }
  return out;
}

function aggregate(results) {
  const totals = results.reduce(
    (acc, result) => {
      acc.fonts += result.counts.fonts;
      acc.textFonts += result.counts.textFonts;
      acc.decided += result.counts.decided;
      acc.naiveDecided += result.counts.naiveDecided;
      acc.unknown += result.counts.unknown;
      acc.conflicts += result.counts.conflicts;
      acc.faux += result.counts.faux;
      acc.withBytes += result.counts.withBytes;
      acc.unresolvedBytes += result.counts.unresolvedBytes;
      return acc;
    },
    { fonts: 0, textFonts: 0, decided: 0, naiveDecided: 0, unknown: 0, conflicts: 0, faux: 0, withBytes: 0, unresolvedBytes: 0 },
  );
  const letterTotals = results.reduce(
    (acc, result) => {
      for (const font of result.fonts) {
        if (font.nameStyle?.kind === "symbol" || !font.usage.letters) continue;
        if (font.nameStyle?.kind === "math") {
          acc.mathLetters += font.usage.letters;
          continue;
        }
        acc.textLetters += font.usage.letters;
        if (font.nameStyle.bold !== null && font.nameStyle.italic !== null) acc.decidedLetters += font.usage.letters;
        else acc.unknownLetters += font.usage.letters;
        if (font.nameStyle.basis !== "unknown" && font.nameStyle.basis !== "convention") acc.naiveLetters += font.usage.letters;
      }
      return acc;
    },
    { textLetters: 0, decidedLetters: 0, unknownLetters: 0, naiveLetters: 0, mathLetters: 0 },
  );
  const draw = results.reduce(
    (acc, result) => {
      acc.invisibleChars += result.fonts.reduce((sum, font) => sum + (font.draw.tr["3"] ?? 0), 0);
      acc.visibleChars += result.fonts.reduce(
        (sum, font) => sum + Object.entries(font.draw.tr).reduce((inner, [mode, count]) => (mode === "3" ? inner : inner + count), 0),
        0,
      );
      acc.shearedGlyphs += result.totals.shearedGlyphs;
      acc.rotatedGlyphs += result.totals.rotatedGlyphs;
      for (const [mode, count] of Object.entries(result.totals.trModes)) acc.trModes[mode] = (acc.trModes[mode] ?? 0) + count;
      return acc;
    },
    { invisibleChars: 0, visibleChars: 0, shearedGlyphs: 0, rotatedGlyphs: 0, trModes: {} },
  );
  return {
    pdfs: results.length,
    ids: results.map((result) => result.id),
    totals,
    letterTotals,
    naiveErrors: naiveErrorsOf(results),
    composition: compositionOf(results),
    draw,
    basisHistogramText: histogram(
      results.flatMap((result) =>
        result.fonts
          .filter((font) => font.nameStyle && font.usage.letters > 0 && font.nameStyle.kind === "text")
          .map((font) => font.nameStyle.basis),
      ),
    ),
    perPdf: results.map((result) => ({
      id: result.id,
      counts: result.counts,
      formats: result.formats,
      trModes: result.totals.trModes,
      shearedGlyphs: result.totals.shearedGlyphs,
      rotatedGlyphs: result.totals.rotatedGlyphs,
      visibleChars: result.fonts.reduce(
        (sum, font) => sum + Object.entries(font.draw.tr).reduce((inner, [mode, count]) => (mode === "3" ? inner : inner + count), 0),
        0,
      ),
      invisibleChars: result.fonts.reduce((sum, font) => sum + (font.draw.tr["3"] ?? 0), 0),
      textLetters: result.fonts.reduce(
        (sum, font) => (font.nameStyle && font.nameStyle.kind === "text" ? sum + font.usage.letters : sum),
        0,
      ),
      naiveErrors: naiveErrorsOf([result]),
    })),
  };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const results = [];
  for (const id of ids) {
    warnings.length = 0;
    try {
      const result = await inspectPdf(id);
      result.warnings = [...new Set(warnings)];
      results.push(result);
      await writeFile(path.join(outDir, `${id}.json`), JSON.stringify(result, null, 2));
      console.log(digestLine(result));
    } catch (err) {
      console.error(`${id}: FAILED ${err?.stack ?? err}`);
      results.push({ id, error: String(err) });
    }
  }

  const ok = results.filter((result) => !result.error);
  const summary = {
    ...aggregate(ok),
    failed: results.length - ok.length,
    basisHistogram: histogram(ok.flatMap((result) => result.fonts.filter((font) => font.nameStyle).map((font) => font.nameStyle.basis))),
    roleHistogram: histogram(
      ok.flatMap((result) => result.fonts.filter((font) => font.nameStyle?.basis === "convention").map((font) => font.nameStyle.role)),
    ),
    conflicts: ok.flatMap((result) => result.conflicts.map((conflict) => ({ id: result.id, ...conflict }))),
    unknown: ok.flatMap((result) => result.unknown.map((entry) => ({ id: result.id, ...entry }))),
    faux: ok.flatMap((result) => result.faux.map((entry) => ({ id: result.id, ...entry }))),
    unresolvedBytes: ok.flatMap((result) => result.unresolvedBytes.map((entry) => ({ id: result.id, ...entry }))),
    widthPairs: ok.flatMap((result) => result.widthPairs.map((pair) => ({ id: result.id, ...pair }))),
    groups: {
      native: aggregate(ok.filter((result) => !OCR_LAYER_IDS.has(result.id))),
      ocrLayer: aggregate(ok.filter((result) => OCR_LAYER_IDS.has(result.id))),
    },
  };
  await writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(`TOTALS ${JSON.stringify(summary.totals)}`);
  console.log(`LETTERS ${JSON.stringify(summary.letterTotals)}`);
  console.log(`NAIVE-ERRORS ${JSON.stringify(summary.naiveErrors)}`);
  for (const [name, group] of Object.entries(summary.groups)) {
    console.log(`GROUP ${name} pdfs=${group.pdfs} ${JSON.stringify(group.letterTotals)} naive=${JSON.stringify(group.naiveErrors)}`);
  }
  console.log(`written to ${outDir}`);
}

const isMain = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();

export { classifyName, conventionOf, stripSubset, splitTokens, styleCode, OCR_LAYER_IDS };
