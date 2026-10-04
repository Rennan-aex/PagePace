#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const corpusDir = process.env.CORPUS_PRIVATE_DIR ?? "<CORPUS_PRIVATE_DIR>";
const outDir = path.join(repoRoot, ".pagepace-cache", "spikes", "S1");
const pdfjsRoot = path.join(repoRoot, "node_modules", "pdfjs-dist");
const toDataPath = (dir) => dir.replace(/\\/g, "/").replace(/\/+$/, "") + "/";

const defaultIds = [
  "n1-pt-sofia",
  "n2-pt-placasdevideo",
  "n3-pt-filosofia",
  "n4-pt-astrofisica",
  "n5-pt-astrofisica",
];
const ids = process.argv.slice(2).length > 0 ? process.argv.slice(2) : defaultIds;

const PDFJS_PARAMS = {
  standardFontDataUrl: toDataPath(path.join(pdfjsRoot, "standard_fonts")),
  cMapUrl: toDataPath(path.join(pdfjsRoot, "cmaps")),
  cMapPacked: true,
  wasmUrl: toDataPath(path.join(pdfjsRoot, "wasm")),
  isEvalSupported: false,
  fontExtraProperties: true,
};

const GAP_RATIO = 0.18;
const warnings = [];
const origWarn = console.warn;
console.warn = (...args) => {
  warnings.push(args.join(" "));
  origWarn(...args);
};

function keysOf(value) {
  if (value === null || typeof value !== "object") return [];
  return Object.keys(value).sort();
}

function histogram(values) {
  const map = new Map();
  for (const value of values) map.set(String(value), (map.get(String(value)) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function normalize(value) {
  return String(value).normalize("NFC").replace(/\u00ad/g, "");
}

function fontKeyOf(item) {
  return item.fontName ?? "(none)";
}

function analyzeTextContent(textContent) {
  const items = textContent.items.filter((i) => typeof i.str === "string");
  const stats = {
    items: items.length,
    emptyItems: items.filter((i) => i.str === "").length,
    whitespaceOnlyItems: items.filter((i) => i.str !== "" && i.str.trim() === "").length,
    itemsWithInnerSpace: items.filter((i) => /\s\S/.test(i.str)).length,
    itemsEndingWithSpace: items.filter((i) => / $/.test(i.str)).length,
    itemsEndingWithHyphen: items.filter((i) => /[-\u2010\u00ad]$/.test(i.str)).length,
    eolItems: items.filter((i) => i.hasEOL === true).length,
    itemsWithCombiningMark: items.filter((i) => /\p{Mn}/u.test(i.str)).length,
    itemsWithSpacingAccent: items.filter((i) => /[\u00B4\u0060\u00B8\u02DC\u00A8\u00AF]/.test(i.str)).length,
    dirValues: histogram(items.map((i) => i.dir)),
    itemKeyVariants: histogram(items.map((i) => keysOf(i).join(","))),
    fontUsage: histogram(items.map(fontKeyOf)),
    chars: items.reduce((sum, i) => sum + i.str.length, 0),
    transformRots: histogram(items.map((i) => `${i.transform[1]},${i.transform[2]}`)),
  };

  const lines = [];
  let line = [];
  for (const item of items) {
    if (item.str !== "") line.push(item);
    if (item.hasEOL) {
      lines.push(line);
      line = [];
    }
  }
  if (line.length > 0) lines.push(line);

  let multiItemLines = 0;
  let gapBoundaries = 0;
  let missingSpaceCandidates = 0;
  let doubleSpaceCandidates = 0;
  let overlapCandidates = 0;
  const missingSamples = [];
  const gapSamples = [];

  for (const l of lines) {
    if (l.length > 1) multiItemLines += 1;
    for (let i = 0; i + 1 < l.length; i++) {
      const a = l[i];
      const b = l[i + 1];
      gapBoundaries += 1;
      const ax = a.transform[4] + a.width;
      const bx = b.transform[4];
      const gap = bx - ax;
      const size = Math.max(a.height, b.height);
      const endsSpace = / $/.test(a.str);
      const startsSpace = /^ /.test(b.str);
      if (endsSpace || startsSpace) {
        if (endsSpace && startsSpace && gap <= GAP_RATIO * size) doubleSpaceCandidates += 1;
        continue;
      }
      if (gap > GAP_RATIO * size) {
        missingSpaceCandidates += 1;
        if (missingSamples.length < 5) {
          missingSamples.push({
            pageLine: lines.indexOf(l),
            a: a.str.slice(-28),
            b: b.str.slice(0, 28),
            gap: Number(gap.toFixed(2)),
            size: Number(size.toFixed(2)),
          });
        }
      } else if (gap < -GAP_RATIO * size) {
        overlapCandidates += 1;
        if (gapSamples.length < 5) {
          gapSamples.push({ a: a.str.slice(-20), b: b.str.slice(0, 20), gap: Number(gap.toFixed(2)) });
        }
      }
    }
  }

  stats.lineCount = lines.length;
  stats.multiItemLines = multiItemLines;
  stats.gapBoundaries = gapBoundaries;
  stats.missingSpaceCandidates = missingSpaceCandidates;
  stats.doubleSpaceCandidates = doubleSpaceCandidates;
  stats.overlapCandidates = overlapCandidates;
  stats.missingSpaceSamples = missingSamples;
  stats.overlapSamples = gapSamples;
  const mid = Math.max(0, Math.floor(lines.length / 2) - 2);
  stats.sampleLines = lines.slice(mid, mid + 4).map((l) => l.map((i) => i.str).join(""));
  stats.multiItemExamples = lines
    .filter((l) => l.length > 1)
    .slice(0, 3)
    .map((l) =>
      l.map((i, idx) => {
        const next = l[idx + 1];
        const gap = next ? next.transform[4] - (i.transform[4] + i.width) : null;
        return {
          str: i.str.slice(0, 40),
          x: Number(i.transform[4].toFixed(1)),
          w: Number(i.width.toFixed(1)),
          h: Number(i.height.toFixed(1)),
          eol: i.hasEOL,
          gapToNext: gap === null ? null : Number(gap.toFixed(2)),
        };
      }),
    );
  return stats;
}

function outlineShape(nodes, depth = 0) {
  if (!Array.isArray(nodes)) return [];
  return nodes.slice(0, 3).map((node) => ({
    depth,
    title: node.title?.slice(0, 50) ?? null,
    bold: node.bold,
    italic: node.italic,
    color: node.color ?? null,
    dest: node.dest ?? null,
    url: node.url ?? null,
    keys: keysOf(node),
    children: outlineShape(node.items ?? [], depth + 1),
  }));
}

function structTreeShape(node, depth = 0) {
  if (node === null || node === undefined || typeof node !== "object") return node ?? null;
  if (depth > 5) return "...";
  const out = { keys: keysOf(node) };
  if (node.role !== undefined) out.role = node.role;
  if (typeof node.value === "string" || typeof node.value === "number") {
    out.value = String(node.value).slice(0, 40);
  }
  for (const field of ["children", "items"]) {
    if (Array.isArray(node[field])) {
      out[field] = node[field].slice(0, 3).map((c) => structTreeShape(c, depth + 1));
      out[`${field}Total`] = node[field].length;
    }
  }
  return out;
}

function countStructRoles(node, acc = new Map(), depth = 0) {
  if (!node || typeof node !== "object" || depth > 12) return acc;
  if (typeof node.role === "string") acc.set(node.role, (acc.get(node.role) ?? 0) + 1);
  for (const field of ["children", "items"]) {
    if (Array.isArray(node[field])) for (const child of node[field]) countStructRoles(child, acc, depth + 1);
  }
  return acc;
}

function fontSummary(font) {
  if (font instanceof Error) return { error: font.message };
  if (!font || typeof font !== "object") return { raw: String(font) };
  const pick = (key) => {
    try {
      const value = font[key];
      if (value === undefined) return "undefined";
      if (value instanceof Uint8Array) return `Uint8Array(${value.byteLength})`;
      return value;
    } catch (err) {
      return `ERROR: ${String(err)}`;
    }
  };
  return {
    ctor: font.constructor?.name ?? null,
    name: pick("name"),
    loadedName: pick("loadedName"),
    fallbackName: pick("fallbackName"),
    bold: pick("bold"),
    italic: pick("italic"),
    black: pick("black"),
    isType3Font: pick("isType3Font"),
    isSerifFont: pick("isSerifFont"),
    isMonospace: pick("isMonospace"),
    isSymbolicFont: pick("isSymbolicFont"),
    type: pick("type"),
    subtype: pick("subtype"),
    ascent: pick("ascent"),
    descent: pick("descent"),
    differencesCount: Array.isArray(font.differences) ? font.differences.filter(Boolean).length : "n/a",
    vertical: pick("vertical"),
    mimetype: pick("mimetype"),
    missingFile: pick("missingFile"),
    cssFontInfo: pick("cssFontInfo"),
    systemFontInfo: pick("systemFontInfo"),
    data: pick("data"),
    bbox: pick("bbox"),
  };
}

async function renderSample(page, pngPath) {
  const viewport = page.getViewport({ scale: 1 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  await writeFile(pngPath, await canvas.encode("png"));
  return { width: canvas.width, height: canvas.height };
}

async function inspectPdf(id) {
  const file = path.join(corpusDir, `${id}.pdf`);
  const data = new Uint8Array(await readFile(file));
  const t0 = Date.now();
  const task = getDocument({ ...PDFJS_PARAMS, data });
  const pdf = await task.promise;
  const openMs = Date.now() - t0;

  const metadata = await pdf.getMetadata().catch((err) => ({ error: String(err) }));
  const outline = await pdf.getOutline().catch((err) => ({ error: String(err) }));
  const info = metadata?.info ?? null;
  const xmpMeta = metadata?.metadata ?? null;
  const xmp = xmpMeta
    ? {
        methods: Object.getOwnPropertyNames(Object.getPrototypeOf(xmpMeta)),
        rawSample: String(xmpMeta.getRaw?.() ?? "").slice(0, 400),
        fields: Object.fromEntries(
          ["dc:title", "dc:creator", "dc:language", "xmp:CreateDate", "pdf:Producer"].map((k) => [k, xmpMeta.get?.(k) ?? null]),
        ),
      }
    : null;

  const totalPages = pdf.numPages;
  const wanted = [...new Set([1, 2, 3, Math.max(1, Math.ceil(totalPages / 2)), totalPages])]
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);

  const pages = [];
  const fonts = new Map();
  const styleByFont = new Map();
  const itemKeyVariants = new Set();
  const totals = {
    pagesProcessed: 0,
    pagesWithText: 0,
    pagesWithoutText: 0,
    pagesWithImages: 0,
    items: 0,
    lines: 0,
    multiItemLines: 0,
    gapBoundaries: 0,
    missingSpaceCandidates: 0,
    doubleSpaceCandidates: 0,
    overlapCandidates: 0,
    eolItems: 0,
    emptyItems: 0,
    itemsEndingWithSpace: 0,
    itemsEndingWithHyphen: 0,
    itemsWithCombiningMark: 0,
    itemsWithSpacingAccent: 0,
    whitespaceOnlyItems: 0,
    imageOps: 0,
    textMs: 0,
    opListMs: 0,
    missingSpaceSamples: [],
  };
  let structTree = null;
  let rendersDone = 0;
  let markedContentSample = null;
  let normalizationDelta = null;
  const annotationSubtypes = new Map();

  const tAll = Date.now();
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const isSample = wanted.includes(pageNum);

    const tText = Date.now();
    const textContent = await page.getTextContent();
    totals.textMs += Date.now() - tText;

    const stats = analyzeTextContent(textContent);
    totals.pagesProcessed += 1;
    totals.items += stats.items;
    totals.lines += stats.lineCount;
    totals.multiItemLines += stats.multiItemLines;
    totals.gapBoundaries += stats.gapBoundaries;
    totals.missingSpaceCandidates += stats.missingSpaceCandidates;
    totals.doubleSpaceCandidates += stats.doubleSpaceCandidates;
    totals.overlapCandidates += stats.overlapCandidates;
    totals.eolItems += stats.eolItems;
    totals.emptyItems += stats.emptyItems;
    totals.itemsEndingWithSpace += stats.itemsEndingWithSpace;
    totals.itemsEndingWithHyphen += stats.itemsEndingWithHyphen;
    totals.itemsWithCombiningMark += stats.itemsWithCombiningMark;
    totals.itemsWithSpacingAccent += stats.itemsWithSpacingAccent;
    totals.whitespaceOnlyItems += stats.whitespaceOnlyItems;
    if (stats.items > 0) totals.pagesWithText += 1;
    else totals.pagesWithoutText += 1;
    for (const sample of stats.missingSpaceSamples) {
      if (totals.missingSpaceSamples.length < 8) totals.missingSpaceSamples.push({ page: pageNum, ...sample });
    }
    for (const variant of stats.itemKeyVariants) itemKeyVariants.add(variant[0]);

    for (const [fontName] of stats.fontUsage) {
      if (fontName === "(none)" || fonts.has(fontName)) continue;
      const style = textContent.styles?.[fontName];
      if (style) styleByFont.set(fontName, keysOf(style).join(","));
    }

    const tOps = Date.now();
    const operatorList = await page.getOperatorList().catch((err) => ({ error: String(err) }));
    totals.opListMs += Date.now() - tOps;
    let imageOps = 0;
    if (operatorList.fnArray) {
      const imageOpsSet = new Set([
        OPS.paintImageXObject, OPS.paintImageMaskXObject, OPS.paintInlineImageXObject,
        OPS.paintImageXObjectRepeat, OPS.paintJpegXObject, OPS.paintImageMaskXObjectRepeat,
      ]);
      for (const fn of operatorList.fnArray) if (imageOpsSet.has(fn)) imageOps += 1;
    }
    totals.imageOps += imageOps;
    if (imageOps > 0) totals.pagesWithImages += 1;

    if (pageNum === 1) {
      structTree = await page.getStructTree().catch((err) => ({ error: String(err) }));
      const annotations = await page.getAnnotations().catch(() => []);
      for (const a of annotations) annotationSubtypes.set(a.subtype ?? "unknown", (annotationSubtypes.get(a.subtype ?? "unknown") ?? 0) + 1);
    }

    for (const fontName of stats.fontUsage.map(([name]) => name)) {
      if (fontName === "(none)" || fonts.has(fontName)) continue;
      let font = null;
      try {
        font = page.commonObjs.get(fontName);
      } catch (err) {
        font = { error: String(err) };
      }
      fonts.set(fontName, fontSummary(font));
    }

    if (isSample) {
      if (stats.items > 0 && (!markedContentSample || stats.items > markedContentSample.items)) {
        const marked = await page.getTextContent({ includeMarkedContent: true }).catch(() => null);
        if (marked) {
          const types = histogram(marked.items.map((i) => i.type ?? "text"));
          const beginItems = marked.items.filter((i) => String(i.type ?? "").startsWith("begin"));
          markedContentSample = {
            page: pageNum,
            items: stats.items,
            types,
            beginCount: beginItems.length,
            beginSample: beginItems.slice(0, 5).map((i) => ({ type: i.type, id: i.id, keys: keysOf(i) })),
            sameTextAsDefault:
              marked.items.filter((i) => typeof i.str === "string").map((i) => i.str).join("") ===
              textContent.items.filter((i) => typeof i.str === "string").map((i) => i.str).join(""),
          };
        }
      }

      if (stats.items > 0 && (!normalizationDelta || stats.items > normalizationDelta.itemsDefault)) {
        const normalized = await page.getTextContent({ disableNormalization: true }).catch(() => null);
        if (normalized) {
          const a = textContent.items.filter((i) => typeof i.str === "string").map((i) => i.str);
          const b = normalized.items.filter((i) => typeof i.str === "string").map((i) => i.str);
          let changed = 0;
          const samples = [];
          for (let i = 0; i < Math.min(a.length, b.length); i++) {
            if (a[i] !== b[i]) {
              changed += 1;
              if (samples.length < 4) samples.push({ default: a[i].slice(0, 40), disabled: b[i].slice(0, 40) });
            }
          }
          normalizationDelta = { page: pageNum, itemsDefault: a.length, itemsDisabled: b.length, changedItems: changed, samples };
        }
      }

      const viewport = page.getViewport({ scale: 1 });
      pages.push({
        pageNumber: pageNum,
        viewport: { width: viewport.width, height: viewport.height, rotation: viewport.rotation },
        stats,
        styles: Object.fromEntries(Object.entries(textContent.styles ?? {}).map(([k, v]) => [k, v])),
      });
    }

    const midPage = Math.ceil(totalPages / 2);
    if (isSample && rendersDone < 2 && (pageNum === 1 || pageNum === midPage)) {
      const pngPath = path.join(outDir, "render", `${id}-p${pageNum}.png`);
      try {
        await mkdir(path.dirname(pngPath), { recursive: true });
        const rendered = await renderSample(page, pngPath);
        pages[pages.length - 1].render = { png: path.relative(repoRoot, pngPath), ...rendered };
        rendersDone += 1;
      } catch (err) {
        pages[pages.length - 1].render = { error: String(err?.message ?? err) };
      }
    }

    page.cleanup();
  }
  const totalMs = Date.now() - tAll;

  await task.destroy().catch(() => {});

  const fontValues = [...fonts.values()];
  const fontAnalysis = {
    total: fontValues.length,
    withRealName: fontValues.filter((f) => typeof f.name === "string" && f.name).length,
    nameSaysBold: fontValues.filter((f) => typeof f.name === "string" && /bold|black/i.test(f.name)).length,
    nameSaysItalic: fontValues.filter((f) => typeof f.name === "string" && /italic|oblique/i.test(f.name)).length,
    boldTrue: fontValues.filter((f) => f.bold === true).length,
    boldFalse: fontValues.filter((f) => f.bold === false).length,
    boldUndefined: fontValues.filter((f) => f.bold === "undefined").length,
    italicTrue: fontValues.filter((f) => f.italic === true).length,
    italicFalse: fontValues.filter((f) => f.italic === false).length,
    italicUndefined: fontValues.filter((f) => f.italic === "undefined").length,
    missingFile: fontValues.filter((f) => f.missingFile === true).length,
    withData: fontValues.filter((f) => typeof f.data === "string" && f.data.startsWith("Uint8Array")).length,
    type3: fontValues.filter((f) => f.isType3Font === true).length,
  };

  return {
    id,
    file: path.basename(file),
    numPages: totalPages,
    openMs,
    totalMs,
    msPerPage: Math.round(totalMs / totalPages),
    rssMb: Math.round(process.memoryUsage().rss / 1048576),
    info: info && typeof info === "object" ? { keys: keysOf(info), value: info } : info,
    xmp,
    outline: Array.isArray(outline)
      ? { count: outline.length, flags: histogram(outline.flatMap((o) => [`${o.bold}/${o.italic}`])), shape: outlineShape(outline) }
      : { value: outline === null ? "null" : typeof outline },
    structTree: structTree && typeof structTree === "object" && structTree.error
      ? structTree
      : structTree === null || structTree === undefined
        ? { value: String(structTree) }
        : {
            roles: [...countStructRoles(structTree).entries()],
            shape: structTreeShape(structTree),
          },
    annotationsOnFirstPage: [...annotationSubtypes.entries()],
    observed: { itemKeyVariants: [...itemKeyVariants], styleKeyVariants: [...new Set(styleByFont.values())] },
    fonts: Object.fromEntries(fonts),
    fontAnalysis,
    styles: Object.fromEntries(styleByFont),
    markedContent: markedContentSample,
    normalization: normalizationDelta,
    totals,
    samplePages: pages,
  };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const results = [];
  for (const id of ids) {
    warnings.length = 0;
    const started = Date.now();
    try {
      const result = await inspectPdf(id);
      result.warnings = [...new Set(warnings)];
      results.push(result);
      await writeFile(path.join(outDir, `${id}.json`), JSON.stringify(result, null, 2));
      console.log(
        `${id}: ok pages=${result.numPages} ms=${result.totalMs} items=${result.totals.items} ` +
          `noText=${result.totals.pagesWithoutText} images=${result.totals.imageOps} warn=${result.warnings.length}`,
      );
    } catch (err) {
      console.error(`${id}: FAILED ${err?.stack ?? err}`);
      results.push({ id, error: String(err), warnings: [...new Set(warnings)] });
    }
  }
  await writeFile(path.join(outDir, "summary.json"), JSON.stringify(results, null, 2));
  console.log(`written to ${outDir}`);
}

await main();
