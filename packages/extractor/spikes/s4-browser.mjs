#!/usr/bin/env node
// Spike S4 (E0-T05): leitura bruta com PDF.js em Chromium (proxy de WebView).
//
// Sobe um servidor estático local, abre o Chromium em modo headless com
// depuração remota (CDP) e roda `s4-bench.html` medindo ms/página, pico de
// memória JS e atraso máximo da thread principal, com throttling de CPU
// (Emulation.setCPUThrottlingRate) para simular um aparelho de entrada.
//
//   node packages/extractor/spikes/s4-browser.mjs n1-pt-sofia --rates 1,4,6 --modes worker,main
//
// Saída: .pagepace-cache/spikes/S4/browser.json (nunca commitar).
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const corpusDir = process.env.CORPUS_PRIVATE_DIR ?? "<CORPUS_PRIVATE_DIR>";
const outDir = path.join(repoRoot, ".pagepace-cache", "spikes", "S4");

const argv = process.argv.slice(2);
const positional = argv.filter((arg) => !arg.startsWith("--"));
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const pdfId = positional[0] ?? "n1-pt-sofia";
const rates = flag("rates", "1,4,6").split(",").map(Number).filter((n) => Number.isFinite(n));
const modes = flag("modes", "worker,main").split(",").map((s) => s.trim()).filter(Boolean);
const pagesLimit = Number(flag("pages", "0")) || 0;
const renderCheckPage = Number(flag("rendercheck", "0")) || 0;
const debugPort = Number(flag("port", "9444"));
const lan = argv.includes("--lan");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".wasm": "application/wasm",
  ".pfb": "application/octet-stream",
  ".bcmap": "application/octet-stream",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff2": "font/woff2",
};

function resolveRequest(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  if (decoded === "/") return path.join(repoRoot, "packages", "extractor", "spikes", "s4-bench.html");
  if (decoded.startsWith("/vendor/pdfjs/")) {
    const rel = decoded.slice("/vendor/pdfjs/".length).replace(/\\/g, "/");
    if (rel.includes("..")) return null;
    return path.join(repoRoot, "node_modules", "pdfjs-dist", rel);
  }
  if (decoded.startsWith("/corpus/")) {
    const rel = decoded.slice("/corpus/".length).replace(/\\/g, "/");
    if (rel.includes("..") || !rel.endsWith(".pdf")) return null;
    return path.join(corpusDir, rel);
  }
  if (decoded.startsWith("/spikes/")) {
    const rel = decoded.slice("/spikes/".length).replace(/\\/g, "/");
    if (rel.includes("..")) return null;
    return path.join(repoRoot, "packages", "extractor", "spikes", rel);
  }
  return null;
}

async function startServer() {
  const server = createServer(async (req, res) => {
    const filePath = resolveRequest(req.url ?? "/");
    if (!filePath) {
      res.writeHead(404).end("not found");
      return;
    }
    try {
      const body = await readFile(filePath);
      const type = MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
      res.writeHead(200, { "content-type": type, "cache-control": "no-store" }).end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise((resolve) => server.listen(0, lan ? "0.0.0.0" : "127.0.0.1", resolve));
  const { port } = server.address();
  return { server, port };
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    path.join(os.homedir(), "AppData/Local/Google/Chrome/Application/chrome.exe"),
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

async function launchChrome(executablePath, port) {
  const profileDir = path.join(os.tmpdir(), `pagepace-s4-${port}`);
  const args = [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--remote-allow-origins=*",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-gpu",
    "--metrics-recording-only",
    "about:blank",
  ];
  const child = spawn(executablePath, args, { stdio: "ignore" });
  const deadline = Date.now() + 20000;
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return { child, profileDir };
    } catch {
      /* chrome ainda subindo */
    }
    if (Date.now() > deadline) throw new Error("Chrome não respondeu em 20 s (debug port)");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function createTarget(port) {
  const url = `http://127.0.0.1:${port}/json/new?about:blank`;
  for (const method of ["PUT", "GET"]) {
    try {
      const res = await fetch(url, { method });
      if (res.ok) return await res.json();
    } catch {
      /* tenta o próximo método */
    }
  }
  throw new Error("não foi possível criar um alvo (target) no Chrome");
}

async function closeTarget(port, targetId) {
  await fetch(`http://127.0.0.1:${port}/json/close/${targetId}`).catch(() => {});
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message}`));
      else resolve(message.result);
    } else if (message.method) {
      for (const listener of listeners.get(message.method) ?? []) listener(message.params);
    }
  });
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  return {
    opened,
    on(method, listener) {
      if (!listeners.has(method)) listeners.set(method, []);
      listeners.get(method).push(listener);
    },
    send(method, params = {}, timeoutMs = 30000) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`timeout em ${method}`));
        }, timeoutMs);
        pending.set(id, {
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      ws.close();
    },
  };
}

async function waitFor(session, expression, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { result, exceptionDetails } = await session.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });
    if (result?.value === true) return;
    if (exceptionDetails) throw new Error(`avaliação falhou: ${exceptionDetails.text}`);
    if (Date.now() > deadline) throw new Error(`timeout esperando: ${expression}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

async function runBench({ chromePort, httpPort, mode, rate, pages, renderCheck }) {
  const target = await createTarget(chromePort);
  const session = connect(target.webSocketDebuggerUrl);
  await session.opened;
  try {
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    await session.send("Log.enable").catch(() => {});
    if (process.env.S4_DEBUG) {
      session.on("Runtime.consoleAPICalled", (params) =>
        console.log(`[console:${params.type}]`, (params.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ")),
      );
      session.on("Runtime.exceptionThrown", (params) =>
        console.log("[exception]", params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text),
      );
      session.on("Log.entryAdded", (params) => console.log(`[log:${params.entry?.level}]`, params.entry?.text));
      session.on("Page.javascriptDialogOpening", (params) => console.log("[dialog]", params.message));
    }
    await session.send("Emulation.setCPUThrottlingRate", { rate });

    const loaded = new Promise((resolve) => session.on("Page.loadEventFired", resolve));
    const benchUrl =
      `http://127.0.0.1:${httpPort}/spikes/s4-bench.html` +
      `?pdf=${encodeURIComponent(pdfId)}&mode=${encodeURIComponent(mode)}` +
      (pages ? `&pages=${pages}` : "") +
      (argv.includes("--countops") ? "&countops=1" : "") +
      `&run=${Date.now()}`;
    await session.send("Page.navigate", { url: benchUrl });
    await Promise.race([
      loaded,
      new Promise((resolve) => setTimeout(resolve, 20000)),
    ]);
    try {
      await waitFor(session, "window.__ready === true", 30000);
    } catch (err) {
      const state = await session
        .send("Runtime.evaluate", {
          expression:
            "JSON.stringify({href: location.href, ready: document.readyState, readyFlag: window.__ready ?? null, " +
            "body: (document.body?.innerText || '').slice(0, 400), scripts: [...document.scripts].map(s => s.src || 'inline')})",
          returnByValue: true,
        })
        .catch(() => null);
      throw new Error(`${err.message} · estado da página: ${state?.result?.value ?? "indisponível"}`);
    }

    const expression = renderCheck ? `window.__renderCheck(${renderCheck})` : "window.__runBench()";
    const evaluated = await session.send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      600000,
    );
    if (evaluated.exceptionDetails) {
      throw new Error(`bench falhou: ${evaluated.exceptionDetails.text ?? ""} ${evaluated.exceptionDetails.exception?.description ?? ""}`);
    }
    const result = evaluated.result?.value;
    if (!result) throw new Error("bench devolveu valor nulo");
    return { ...result, cpuThrottleRate: rate, mode };
  } finally {
    session.close();
    await closeTarget(chromePort, target.id);
  }
}

async function main() {
  if (argv.includes("--serve")) {
    // Modo "celular": só o servidor local. O PO abre a URL no navegador do
    // aparelho (mesma rede Wi-Fi) e copia o JSON que aparece na tela.
    const { server, port } = await startServer();
    const ips = Object.values(os.networkInterfaces())
      .flat()
      .filter((iface) => iface && iface.family === "IPv4" && !iface.internal)
      .map((iface) => iface.address);
    console.log("Servidor do bench S4 no ar. No CELULAR (mesma rede Wi-Fi), abra uma destas URLs:");
    if (!lan) {
      console.log("  (aviso: sem --lan só responde no próprio PC; rode de novo com --lan para o celular)");
    }
    for (const ip of ips) {
      for (const mode of modes) {
        console.log(`  http://${ip}:${port}/spikes/s4-bench.html?pdf=${pdfId}&mode=${mode}`);
      }
    }
    console.log(`  (no PC: http://127.0.0.1:${port}/spikes/s4-bench.html?pdf=${pdfId}&mode=worker)`);
    console.log("A página mostra o JSON com os números. Ctrl+C para encerrar.");
    await new Promise(() => {});
    server.close();
    return;
  }

  const chromePath = findChrome();
  if (!chromePath) {
    throw new Error(
      "Nenhum Chrome/Edge encontrado. Defina CHROME_PATH e rode de novo, ou veja o roteiro manual em docs/extractor/spikes/S4-performance.md.",
    );
  }

  const { server, port: httpPort } = await startServer();
  console.log(`servidor local em http://127.0.0.1:${httpPort} (corpus: ${corpusDir})`);
  const chrome = await launchChrome(chromePath, debugPort);
  console.log(`chromium: ${chromePath} (porta ${debugPort})`);

  const runs = [];
  const started = Date.now();
  try {
    for (const mode of modes) {
      for (const rate of rates) {
        const label = `${mode} @ ${rate}x${renderCheckPage ? ` · render p${renderCheckPage}` : ""}`;
        process.stdout.write(`${label} … `);
        try {
          const result = await runBench({
            chromePort: debugPort,
            httpPort,
            mode,
            rate,
            pages: pagesLimit,
            renderCheck: renderCheckPage,
          });
          runs.push(result);
          if (result.kind === "renderCheck") {
            console.log(`ok render=${result.renderMs} ms · ${result.width}x${result.height} · pixels escuros=${result.darkSamples} · png=${result.pngBytes} B`);
          } else {
            console.log(
              `ok ${result.msPerPage.read} ms/pág · p95 ${result.perPage.p95} ms · lag ${result.eventLoop.maxLagMs} ms · heap ${result.memory.peakHeapMb} MB`,
            );
          }
        } catch (err) {
          console.log(`FALHOU: ${err.message}`);
          runs.push({ kind: renderCheckPage ? "renderCheck" : "bench", mode, cpuThrottleRate: rate, pdfId, error: String(err.message ?? err) });
        }
      }
    }
  } finally {
    chrome.child.kill();
    await new Promise((resolve) => server.close(resolve));
  }

  const existingPath = path.join(outDir, "browser.json");
  let previousRuns = [];
  try {
    previousRuns = JSON.parse(await readFile(existingPath, "utf8")).runs ?? [];
  } catch {
    previousRuns = [];
  }
  const keyOf = (run) =>
    `${run.kind ?? "bench"}:${run.mode}@${run.cpuThrottleRate}${run.pageNum ? `:p${run.pageNum}` : ""}`;
  const freshKeys = new Set(runs.filter((run) => !run.error).map(keyOf));
  const kept = previousRuns.filter((run) => run.pdfId !== pdfId || !freshKeys.has(keyOf(run)));
  const summary = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    chrome: chromePath,
    platform: `${process.platform} ${process.arch}`,
    pagesLimit: pagesLimit || "all",
    wallMs: Date.now() - started,
    runs: [...kept, ...runs],
  };
  await mkdir(outDir, { recursive: true });
  await writeFile(existingPath, JSON.stringify(summary, null, 2));
  console.log(`escrito em ${existingPath}`);
}

await main();
