#!/usr/bin/env node
// Spike S3 (E0-T04): cobertura e confiabilidade da struct tree ("PDF tagged").
// Mede, por PDF: presenca de StructTreeRoot/MarkInfo, paginas com arvore,
// histograma de roles, cobertura (nos de conteudo x itens de texto), hierarquia
// invalida, headings, figuras e Artifact. Compara com o visual via `render`.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const corpusDir = process.env.CORPUS_PRIVATE_DIR ?? "<CORPUS_PRIVATE_DIR>";
const outDir = path.join(repoRoot, ".pagepace-cache", "spikes", "S3");
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

const PDFJS_PARAMS = {
  standardFontDataUrl: toDataPath(path.join(pdfjsRoot, "standard_fonts")),
  cMapUrl: toDataPath(path.join(pdfjsRoot, "cmaps")),
  cMapPacked: true,
  wasmUrl: toDataPath(path.join(pdfjsRoot, "wasm")),
  isEvalSupported: false,
};

const warnings = [];
console.warn = (...args) => {
  warnings.push(args.join(" "));
};

// Roles que sao "content" no pdf.js (no tem `role`, tem `type`).
const isContentNode = (node) => node?.type === "content" || node?.type === "Object";
const HEADINGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "H7"]);
// Blocos nao podem ser filhos de inline/leaf (ex.: Sect dentro de P = hierarquia invertida).
const BLOCK_ROLES = new Set(["Part", "Sect", "Document", "Div", "Aside", "Nav", "Section", "Artwork"]);
const NON_BLOCK_PARENTS = new Set([
  "P", "Span", "H1", "H2", "H3", "H4", "H5", "H6", "Caption", "Figure", "TD", "TH", "LI", "Label",
]);

function newStats() {
  return {
    nodes: 0,
    contentNodes: 0,
    roles: {},
    maxDepth: 0,
    headings: {},
    figures: { total: 0, withAlt: 0, withBbox: 0 },
    artifacts: 0,
    emptyP: 0,
    invalidNesting: [],
  };
}

function walk(node, depth, parentRole, stats) {
  if (!node || typeof node !== "object") return;
  if (isContentNode(node)) {
    stats.contentNodes += 1;
    stats.nodes += 1;
    return;
  }
  const role = node.role ?? "(none)";
  stats.nodes += 1;
  stats.roles[role] = (stats.roles[role] ?? 0) + 1;
  stats.maxDepth = Math.max(stats.maxDepth, depth);
  if (HEADINGS.has(role)) stats.headings[role] = (stats.headings[role] ?? 0) + 1;
  if (role === "Artifact") stats.artifacts += 1;
  if (role === "Figure") {
    stats.figures.total += 1;
    if (typeof node.alt === "string" && node.alt.trim()) stats.figures.withAlt += 1;
    if (Array.isArray(node.bbox) && node.bbox.length === 4) stats.figures.withBbox += 1;
  }
  if (BLOCK_ROLES.has(role) && parentRole && NON_BLOCK_PARENTS.has(parentRole)) {
    if (stats.invalidNesting.length < 5) stats.invalidNesting.push(`${role} inside ${parentRole}`);
  }
  const children = Array.isArray(node.children) ? node.children : [];
  const before = stats.contentNodes;
  for (const child of children) walk(child, depth + 1, role, stats);
  if (role === "P" && stats.contentNodes === before) stats.emptyP += 1;
}

function mergeStats(total, part) {
  total.nodes += part.nodes;
  total.contentNodes += part.contentNodes;
  total.maxDepth = Math.max(total.maxDepth, part.maxDepth);
  total.artifacts += part.artifacts;
  total.emptyP += part.emptyP;
  total.figures.total += part.figures.total;
  total.figures.withAlt += part.figures.withAlt;
  total.figures.withBbox += part.figures.withBbox;
  for (const [key, value] of Object.entries(part.roles)) total.roles[key] = (total.roles[key] ?? 0) + value;
  for (const [key, value] of Object.entries(part.headings)) total.headings[key] = (total.headings[key] ?? 0) + value;
  for (const item of part.invalidNesting) {
    if (total.invalidNesting.length < 5 && !total.invalidNesting.includes(item)) total.invalidNesting.push(item);
  }
  return total;
}

async function inspectPdf(id) {
  const file = path.join(corpusDir, `${id}.pdf`);
  const data = new Uint8Array(await readFile(file));
  const task = getDocument({ ...PDFJS_PARAMS, data });
  const pdf = await task.promise;

  const markInfo = await pdf.getMarkInfo().catch(() => null);
  const marked = markInfo instanceof Map ? markInfo.get("Marked") === true : markInfo?.Marked === true;
  const totalPages = pdf.numPages;

  let pagesWithText = 0;
  let pagesWithTree = 0;
  let pagesWithUsableTree = 0;
  let textItems = 0;
  let letters = 0;
  const stats = newStats();
  const samples = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const items = textContent.items.filter((item) => typeof item.str === "string");
    const pageLetters = items.reduce((sum, item) => sum + (item.str.match(/\p{L}/gu)?.length ?? 0), 0);
    if (items.length > 0) pagesWithText += 1;
    textItems += items.length;
    letters += pageLetters;

    const tree = await page.getStructTree().catch(() => null);
    if (tree) {
      pagesWithTree += 1;
      const pageStats = newStats();
      walk(tree, 1, null, pageStats);
      mergeStats(stats, pageStats);
      const rolesExceptRoot = Object.entries(pageStats.roles).filter(([role]) => role !== "Root");
      const usable = pageStats.contentNodes > 0;
      if (usable) pagesWithUsableTree += 1;
      if (samples.length < 3 && usable) {
        samples.push({
          page: pageNum,
          textItems: items.length,
          contentNodes: pageStats.contentNodes,
          roles: Object.fromEntries(rolesExceptRoot),
          firstText: (items.find((item) => item.str.trim())?.str ?? "").slice(0, 60),
        });
      }
    }
    page.cleanup();
  }

  await task.destroy().catch(() => {});
  return {
    id,
    file: path.basename(file),
    numPages: totalPages,
    marked,
    markInfo: markInfo instanceof Map ? Object.fromEntries(markInfo) : markInfo,
    pagesWithText,
    pagesWithTree,
    pagesWithUsableTree,
    textItems,
    letters,
    stats,
    samples,
    warnings: [...new Set(warnings)],
  };
}

function digestLine(r) {
  const coverage = r.pagesWithText > 0 ? (r.pagesWithUsableTree / r.pagesWithText) : 0;
  return [
    r.id.padEnd(20),
    `pages=${String(r.numPages).padStart(4)}`,
    `marked=${String(r.marked).padStart(5)}`,
    `treePages=${String(r.pagesWithTree).padStart(4)}/${r.pagesWithText}`,
    `usable=${String(r.pagesWithUsableTree).padStart(4)}`,
    `coverage=${(coverage * 100).toFixed(1).padStart(5)}%`,
    `content=${String(r.stats.contentNodes).padStart(6)}`,
    `items=${String(r.textItems).padStart(6)}`,
    `roles=${JSON.stringify(r.stats.roles)}`,
    r.stats.invalidNesting.length ? `INVALID=${JSON.stringify(r.stats.invalidNesting)}` : "",
  ].filter(Boolean).join(" ");
}

async function renderPage(id, pageNum, scaleArg) {
  const { createCanvas } = await import("@napi-rs/canvas");
  const file = path.join(corpusDir, `${id}.pdf`);
  const data = new Uint8Array(await readFile(file));
  const task = getDocument({ ...PDFJS_PARAMS, data, fontExtraProperties: false });
  const pdf = await task.promise;
  const page = await pdf.getPage(pageNum);
  const scale = scaleArg ? Number(scaleArg) : 1.5;
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const outPath = path.join(outDir, "render", `${id}-p${pageNum}.png`);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, await canvas.encode("png"));
  console.log(`${outPath} ${canvas.width}x${canvas.height}`);
  await task.destroy().catch(() => {});
}

function printTree(node, indent = 0, parentRole = null) {
  if (!node || typeof node !== "object") return;
  const pad = "  ".repeat(indent);
  if (isContentNode(node)) {
    console.log(`${pad}content ${node.id ?? ""}`);
    return;
  }
  const role = node.role ?? "(none)";
  const extras = [];
  if (typeof node.alt === "string" && node.alt.trim()) extras.push(`alt=${JSON.stringify(node.alt.slice(0, 70))}`);
  if (Array.isArray(node.bbox)) extras.push(`bbox=${node.bbox.map((v) => Math.round(v)).join(",")}`);
  if (node.lang) extras.push(`lang=${node.lang}`);
  const invalid = BLOCK_ROLES.has(role) && parentRole && NON_BLOCK_PARENTS.has(parentRole);
  console.log(`${pad}${role}${extras.length ? " " + extras.join(" ") : ""}${invalid ? "   <-- INVERTED" : ""}`);
  for (const child of node.children ?? []) printTree(child, indent + 1, role);
}

async function dumpTree(id, pageNum) {
  const file = path.join(corpusDir, `${id}.pdf`);
  const data = new Uint8Array(await readFile(file));
  const task = getDocument({ ...PDFJS_PARAMS, data });
  const pdf = await task.promise;
  const page = await pdf.getPage(pageNum);
  const tree = await page.getStructTree().catch(() => null);
  const text = await page.getTextContent();
  console.log(`# ${id} page ${pageNum}: tree=${tree ? "yes" : "null"}, textItems=${text.items.filter((i) => typeof i.str === "string").length}`);
  if (tree) printTree(tree);
  console.log("# first text items:");
  for (const item of text.items.filter((i) => typeof i.str === "string").slice(0, 12)) console.log(`  ${JSON.stringify(item.str.slice(0, 70))}`);
  await task.destroy().catch(() => {});
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "render") {
    const [, id, pageNum, scale] = args;
    await renderPage(id, Number(pageNum), scale);
    return;
  }
  if (args[0] === "tree") {
    const [, id, pageNum] = args;
    await dumpTree(id, Number(pageNum));
    return;
  }

  const ids = args.length > 0 ? args : defaultIds;
  await mkdir(outDir, { recursive: true });
  const results = [];
  for (const id of ids) {
    warnings.length = 0;
    try {
      const result = await inspectPdf(id);
      results.push(result);
      await writeFile(path.join(outDir, `${id}.json`), JSON.stringify(result, null, 2));
      console.log(digestLine(result));
    } catch (err) {
      console.error(`${id}: FAILED ${err?.stack ?? err}`);
      results.push({ id, error: String(err) });
    }
  }

  const ok = results.filter((result) => !result.error);
  const totals = ok.reduce(
    (acc, result) => {
      acc.pages += result.numPages;
      acc.pagesWithText += result.pagesWithText;
      acc.pagesWithTree += result.pagesWithTree;
      acc.pagesWithUsableTree += result.pagesWithUsableTree;
      acc.textItems += result.textItems;
      acc.letters += result.letters;
      acc.marked += result.marked ? 1 : 0;
      acc.hasTree += result.pagesWithTree > 0 ? 1 : 0;
      acc.usableTree += result.pagesWithUsableTree > 0 ? 1 : 0;
      acc.invalidDocs += result.stats.invalidNesting.length > 0 ? 1 : 0;
      return acc;
    },
    { pages: 0, pagesWithText: 0, pagesWithTree: 0, pagesWithUsableTree: 0, textItems: 0, letters: 0, marked: 0, hasTree: 0, usableTree: 0, invalidDocs: 0 },
  );
  const roles = newStats();
  for (const result of ok) mergeStats(roles, result.stats);

  const summary = {
    pdfs: ok.length,
    failed: results.length - ok.length,
    totals,
    roles: roles.roles,
    headings: roles.headings,
    figures: roles.figures,
    artifacts: roles.artifacts,
    emptyP: roles.emptyP,
    contentNodes: roles.contentNodes,
    invalidNesting: ok.flatMap((result) => (result.stats.invalidNesting.length ? [{ id: result.id, items: result.stats.invalidNesting }] : [])),
    perPdf: ok.map((result) => ({
      id: result.id,
      numPages: result.numPages,
      marked: result.marked,
      pagesWithText: result.pagesWithText,
      pagesWithTree: result.pagesWithTree,
      pagesWithUsableTree: result.pagesWithUsableTree,
      textItems: result.textItems,
      contentNodes: result.stats.contentNodes,
      roles: result.stats.roles,
      headings: result.stats.headings,
      invalidNesting: result.stats.invalidNesting,
    })),
  };
  await writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(`TOTALS ${JSON.stringify(totals)}`);
  console.log(`ROLES ${JSON.stringify(roles.roles)}`);
  console.log(`HEADINGS ${JSON.stringify(roles.headings)} FIGURES ${JSON.stringify(roles.figures)}`);
  console.log(`ARTIFACTS ${roles.artifacts} EMPTY_P ${roles.emptyP} CONTENT ${roles.contentNodes}`);
  console.log(`INVALID ${JSON.stringify(summary.invalidNesting)}`);
  console.log(`written to ${outDir}`);
}

const isMain = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();

export { walk, newStats, mergeStats };
