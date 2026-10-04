#!/usr/bin/env node
// Spike S4 (E0-T05): desempenho do PDF.js em Node.
//
// Modo normal (pai): roda cada PDF em um processo filho limpo (pico de memória
// isolado por documento) e junta tudo em `summary.json`.
//   node packages/extractor/spikes/s4-performance.mjs                 # 15 PDFs, 2 variantes
//   node packages/extractor/spikes/s4-performance.mjs n1-pt-sofia     # só esses IDs
// Modo filho (interno): mede um PDF e grava `<id>.json` / `<id>.nofont.json`.
//   node --expose-gc s4-performance.mjs --one <id> [--no-font-extra]
//
// O que é medido por PDF (leitura bruta, página a página, sem reter dados):
//   openMs, firstPageMs (+ render da p1), getTextContent, getOperatorList,
//   p50/p95/pior página, pico de memória (RSS/heap/external) e atraso máximo
//   do event loop (em Node o PDF.js roda na thread principal = sem worker,
//   então esse atraso é o congelamento de UI que aconteceria no WebView).
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const corpusDir = process.env.CORPUS_PRIVATE_DIR ?? "<CORPUS_PRIVATE_DIR>";
const outDir = path.join(repoRoot, ".pagepace-cache", "spikes", "S4");
const pdfjsRoot = path.join(repoRoot, "node_modules", "pdfjs-dist");
const toDataPath = (dir) => dir.replace(/\\/g, "/").replace(/\/+$/, "") + "/";

const ALL_IDS = [
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

const BASE_PDFJS_PARAMS = {
  standardFontDataUrl: toDataPath(path.join(pdfjsRoot, "standard_fonts")),
  cMapUrl: toDataPath(path.join(pdfjsRoot, "cmaps")),
  cMapPacked: true,
  wasmUrl: toDataPath(path.join(pdfjsRoot, "wasm")),
  isEvalSupported: false,
};

const MB = 1048576;
const round = (value, digits = 1) => Number(value.toFixed(digits));
const ms = () => performance.now();

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1));
  return sortedValues[index];
}

// Atraso máximo do event loop: em Node (thread única, sem worker) é o tempo
// máximo que a UI ficaria congelada se a leitura rodasse na thread principal.
function startHeartbeat(intervalMs = 10) {
  let expected = ms() + intervalMs;
  let maxLag = 0;
  const timer = setInterval(() => {
    const now = ms();
    const lag = now - expected;
    if (lag > maxLag) maxLag = lag;
    expected = now + intervalMs;
  }, intervalMs);
  timer.unref?.();
  return {
    stop() {
      clearInterval(timer);
      return round(maxLag, 1);
    },
  };
}

function sampleMemory() {
  const usage = process.memoryUsage();
  return {
    rssMb: usage.rss / MB,
    heapUsedMb: usage.heapUsed / MB,
    externalMb: usage.external / MB,
  };
}

function renderPage(page) {
  const viewport = page.getViewport({ scale: 1 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return page.render({ canvasContext: ctx, viewport }).promise.then(() => ({
    width: canvas.width,
    height: canvas.height,
  }));
}

async function measureOne(id, { fontExtraProperties }) {
  const variant = fontExtraProperties ? "font-extra" : "plain";
  const file = path.join(corpusDir, `${id}.pdf`);
  const data = new Uint8Array(await readFile(file));

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));

  let heartbeat = startHeartbeat();
  const peak = { rssMb: 0, heapUsedMb: 0, externalMb: 0 };
  const sample = () => {
    const now = sampleMemory();
    if (now.rssMb > peak.rssMb) peak.rssMb = now.rssMb;
    if (now.heapUsedMb > peak.heapUsedMb) peak.heapUsedMb = now.heapUsedMb;
    if (now.externalMb > peak.externalMb) peak.externalMb = now.externalMb;
  };
  sample();

  const tOpen = ms();
  const task = getDocument({ ...BASE_PDFJS_PARAMS, data, fontExtraProperties });
  const pdf = await task.promise;
  const openMs = ms() - tOpen;

  const totalPages = pdf.numPages;
  const pageTimes = [];
  let textMs = 0;
  let opsMs = 0;
  let getPageMs = 0;
  let items = 0;
  let chars = 0;
  let pagesWithText = 0;
  let firstPageMs = null;
  let firstPageRenderMs = null;
  let openMaxLagMs = 0;
  const renderSamples = [];
  const renderTargets = [...new Set([1, Math.round(totalPages * 0.25), Math.round(totalPages * 0.5), totalPages])]
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const tPage = ms();

    const tGet = ms();
    const page = await pdf.getPage(pageNum);
    getPageMs += ms() - tGet;

    const tText = ms();
    const textContent = await page.getTextContent();
    textMs += ms() - tText;
    const pageItems = textContent.items.filter((i) => typeof i.str === "string");
    items += pageItems.length;
    for (const item of pageItems) chars += item.str.length;
    if (pageItems.length > 0) pagesWithText += 1;

    const tOps = ms();
    await page.getOperatorList();
    opsMs += ms() - tOps;

    if (renderTargets.includes(pageNum)) {
      const tRender = ms();
      await renderPage(page);
      const renderMs = ms() - tRender;
      renderSamples.push({ page: pageNum, ms: round(renderMs) });
      if (pageNum === 1) firstPageRenderMs = renderMs;
    }

    page.cleanup();
    pageTimes.push(ms() - tPage);
    sample();
    if (pageNum === 1) {
      firstPageMs = ms() - tOpen;
      openMaxLagMs = heartbeat.stop();
      heartbeat = startHeartbeat();
    }
  }

  const totalMs = ms() - tOpen;
  const pagesMaxLagMs = heartbeat.stop();

  globalThis.gc?.();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const rssAfterGcMb = process.memoryUsage().rss / MB;
  await task.destroy().catch(() => {});
  console.warn = originalWarn;

  const sortedPageTimes = [...pageTimes].sort((a, b) => a - b);
  const renderTotal = renderSamples.reduce((sum, r) => sum + r.ms, 0);
  const result = {
    id,
    variant,
    file: path.basename(file),
    numPages: totalPages,
    content: { items, chars, pagesWithText },
    timing: {
      openMs: round(openMs),
      firstPageMs: round(firstPageMs ?? 0),
      firstPageRenderMs: firstPageRenderMs === null ? null : round(firstPageRenderMs),
      firstPageTotalMs: round((firstPageMs ?? 0) + (firstPageRenderMs ?? 0)),
      getPageMs: round(getPageMs),
      textMs: round(textMs),
      opsMs: round(opsMs),
      readMs: round(getPageMs + textMs + opsMs),
      totalMs: round(totalMs),
      msPerPage: {
        open: round(openMs / totalPages, 2),
        getPage: round(getPageMs / totalPages, 2),
        text: round(textMs / totalPages, 2),
        ops: round(opsMs / totalPages, 2),
        read: round((getPageMs + textMs + opsMs) / totalPages, 2),
        total: round(totalMs / totalPages, 2),
      },
      perPage: {
        p50: round(percentile(sortedPageTimes, 50)),
        p95: round(percentile(sortedPageTimes, 95)),
        max: round(sortedPageTimes[sortedPageTimes.length - 1] ?? 0),
      },
    },
    render: {
      samples: renderSamples,
      msPerPage: renderSamples.length > 0 ? round(renderTotal / renderSamples.length) : null,
    },
    eventLoop: {
      maxLagMs: Math.max(openMaxLagMs, pagesMaxLagMs),
      openMaxLagMs: round(openMaxLagMs, 1),
      pagesMaxLagMs: round(pagesMaxLagMs, 1),
    },
    memory: {
      peakRssMb: round(peak.rssMb),
      peakHeapUsedMb: round(peak.heapUsedMb),
      peakExternalMb: round(peak.externalMb),
      rssAfterGcMb: round(rssAfterGcMb),
    },
    warnings: [...new Set(warnings)],
  };
  return result;
}

// Piso da memória: processo só com o PDF.js importado, sem documento algum.
// Serve para separar "V8 + pdf.js" do "custo do livro" nos picos de RSS.
async function measureIdle() {
  globalThis.gc?.();
  await new Promise((resolve) => setTimeout(resolve, 100));
  globalThis.gc?.();
  const memory = sampleMemory();
  return {
    kind: "idle",
    node: process.version,
    rssMb: round(memory.rssMb),
    heapUsedMb: round(memory.heapUsedMb),
    externalMb: round(memory.externalMb),
  };
}

async function runChild(argv) {
  if (argv.includes("--idle")) {
    const result = await measureIdle();
    await mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, "idle.json");
    await writeFile(outPath, JSON.stringify(result, null, 2));
    process.stdout.write(`RESULT ${outPath}\n`);
    return;
  }
  const id = argv[argv.indexOf("--one") + 1];
  const fontExtraProperties = !argv.includes("--no-font-extra");
  const result = await measureOne(id, { fontExtraProperties });
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, fontExtraProperties ? `${id}.json` : `${id}.nofont.json`);
  await writeFile(outPath, JSON.stringify(result, null, 2));
  process.stdout.write(`RESULT ${outPath}\n`);
}

async function runChildProcess(args) {
  const spawnArgs = ["--expose-gc", fileURLToPath(import.meta.url), ...args];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, spawnArgs, { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (err) => resolve({ args, error: String(err) }));
    child.on("close", async (code) => {
      const match = stdout.match(/RESULT (.+)$/m);
      if (code !== 0 || !match) {
        resolve({ args, error: stderr.trim() || `exit ${code}` });
        return;
      }
      try {
        const result = JSON.parse(await readFile(match[1].trim(), "utf8"));
        resolve({ args, result });
      } catch (err) {
        resolve({ args, error: String(err) });
      }
    });
  });
}

async function runParent(argv) {
  const ids = argv.filter((arg) => !arg.startsWith("--"));
  const selected = ids.length > 0 ? ids : ALL_IDS;
  await mkdir(outDir, { recursive: true });
  const started = ms();

  const idle = await runChildProcess(["--idle"]);
  if (idle.result) console.log(`baseline (sem documento): rss=${idle.result.rssMb} MB heap=${idle.result.heapUsedMb} MB`);
  else console.error(`baseline falhou: ${idle.error}`);

  const runs = [];
  for (const id of selected) {
    for (const fontExtraProperties of [true, false]) {
      const args = ["--one", id, ...(fontExtraProperties ? [] : ["--no-font-extra"])];
      const run = await runChildProcess(args);
      runs.push({ id, fontExtraProperties, ...run });
      if (run.result) {
        const t = run.result.timing;
        console.log(
          `${id}${fontExtraProperties ? "          " : " (nofont) "} pages=${String(run.result.numPages).padStart(3)} ` +
            `read=${String(t.msPerPage.read).padStart(6)} ms/pág text=${String(t.msPerPage.text).padStart(5)} ` +
            `ops=${String(t.msPerPage.ops).padStart(5)} open=${String(t.openMs).padStart(5)} ` +
            `rss=${String(run.result.memory.peakRssMb).padStart(6)} MB lag=${run.result.eventLoop.maxLagMs} ms`,
        );
      } else {
        console.error(`${id}${fontExtraProperties ? "" : " (nofont)"}: FAILED ${run.error}`);
      }
    }
  }
  const summary = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    corpusDir,
    wallMs: round(ms() - started),
    idle: idle.result ?? { error: idle.error },
    runs,
  };
  await writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(`written to ${path.join(outDir, "summary.json")}`);
}

const argv = process.argv.slice(2);
if (argv.includes("--one") || argv.includes("--idle")) {
  await runChild(argv);
} else {
  await runParent(argv);
}
