#!/usr/bin/env node
// Spike S5 (E0-T06): auditoria de licenças das dependências.
//
// Parte 1 (local): varre `node_modules/.pnpm` e lê o `package.json` de cada
//   pacote instalado -> nome, versão, licença, tamanho em disco, binário
//   nativo (`.node`), `bin`. Classifica contra a política da ADR-006.
// Parte 2 (candidatos): consulta o registro npm dos pacotes candidatos das
//   próximas tarefas (geração de PDF, validação, segmentação, lint) e guarda
//   o resultado em cache para poder rodar de novo sem rede.
//
//   node packages/extractor/spikes/s5-licenses.mjs            # local + rede
//   node packages/extractor/spikes/s5-licenses.mjs --offline  # só o cache
//
// Saídas: tabelas Markdown no stdout + JSON em `.pagepace-cache/spikes/S5/`.
import { readdir, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const pnpmDir = path.join(repoRoot, "node_modules", ".pnpm");
const outDir = path.join(repoRoot, ".pagepace-cache", "spikes", "S5");
const cacheFile = path.join(outDir, "npm-registry.json");
const offline = process.argv.includes("--offline");

// Política da ADR-006: MIT/BSD/Apache/ISC entram; GPL/AGPL/etc. não.
const ALLOWED = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "Unlicense",
  "CC0-1.0",
  "BlueOak-1.0.0",
]);
const COPYLEFT = ["AGPL", "GPL", "LGPL", "SSPL", "MPL-2.0", "EPL", "CDDL", "CECILL"];

// Candidatos por grupo: o porquê de cada um estar aqui está no relatório S5.
const CANDIDATES = [
  { group: "leitura de PDF", name: "pdfjs-dist" },
  { group: "leitura de PDF (esperado bloqueado)", name: "mupdf" },
  { group: "leitura de PDF (só Node)", name: "pdf-parse" },
  { group: "geração de PDF (ADR-013)", name: "pdf-lib" },
  { group: "geração de PDF (ADR-013)", name: "pdfkit" },
  { group: "geração de PDF (ADR-013)", name: "jspdf" },
  { group: "validação de esquema", name: "zod" },
  { group: "validação de esquema", name: "ajv" },
  { group: "validação de esquema", name: "valibot" },
  { group: "segmentação", name: "compromise" },
  { group: "segmentação", name: "sentence-splitter" },
  { group: "segmentação (pesado de propósito)", name: "natural" },
  { group: "lint/format (ADR-017)", name: "@biomejs/biome" },
];

const mb = (bytes) => (bytes / 1048576).toFixed(1).replace(".", ",");
const num = (value) => String(value);

function licenseVerdict(license) {
  if (!license) return "sem licença declarada";
  const options = String(license)
    .split(/\s+(?:OR|AND)\s+/)
    .map((part) => part.replace(/[()]/g, "").trim());
  if (options.some((option) => ALLOWED.has(option))) return "OK";
  if (options.some((option) => COPYLEFT.some((bad) => option.startsWith(bad)))) return "BLOQUEADA";
  return "revisar";
}

function normalizeLicense(manifest) {
  if (typeof manifest.license === "string") return manifest.license;
  if (Array.isArray(manifest.licenses)) return manifest.licenses.map((item) => item.type).join(" OR ");
  return null;
}

async function dirSize(dir, isTop = true) {
  let total = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await dirSize(full, false);
    else if (entry.isFile()) total += (await stat(full)).size;
  }
  return total;
}

async function hasNativeBinary(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (await hasNativeBinary(full)) return true;
    } else if (entry.name.endsWith(".node")) return true;
  }
  return false;
}

// --- Parte 1: o que já está instalado -------------------------------------

async function readPackage(pkgDir) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(pkgDir, "package.json"), "utf8"));
  } catch {
    return null;
  }
  const license = normalizeLicense(manifest);
  const files = await readdir(pkgDir);
  const licenseFile = files.some((name) => /^licen[cs]e|^notice|^copying/i.test(name));
  return {
    name: manifest.name ?? path.basename(pkgDir),
    version: manifest.version ?? "?",
    license,
    licenseFile,
    sizeBytes: await dirSize(pkgDir),
    native: await hasNativeBinary(pkgDir),
    bin: Boolean(manifest.bin),
    verdict: licenseVerdict(license),
  };
}

async function scanInstalled() {
  const storeEntries = (await readdir(pnpmDir, { withFileTypes: true })).filter(
    (entry) => entry.isDirectory() && entry.name !== "node_modules",
  );
  const seen = new Map();
  for (const entry of storeEntries) {
    const storeModules = path.join(pnpmDir, entry.name, "node_modules");
    const names = await readdir(storeModules, { withFileTypes: true });
    const targets = [];
    for (const nameEntry of names) {
      if (!nameEntry.isDirectory()) continue;
      if (nameEntry.name.startsWith("@")) {
        const scoped = await readdir(path.join(storeModules, nameEntry.name), { withFileTypes: true });
        for (const child of scoped) {
          if (child.isDirectory()) targets.push(`${nameEntry.name}/${child.name}`);
        }
      } else {
        targets.push(nameEntry.name);
      }
    }
    for (const name of targets) {
      const pkg = await readPackage(path.join(storeModules, name));
      if (pkg) seen.set(`${pkg.name}@${pkg.version}`, pkg);
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// --- Parte 2: candidatos no registro npm ----------------------------------

async function fetchCandidates(cache) {
  const results = [];
  for (const candidate of CANDIDATES) {
    let meta = cache[candidate.name];
    if (!meta && !offline) {
      const url = `https://registry.npmjs.org/${candidate.name.replace("/", "%2f")}/latest`;
      const response = await fetch(url, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`${candidate.name}: HTTP ${response.status}`);
      const body = await response.json();
      meta = {
        name: body.name,
        version: body.version,
        license: typeof body.license === "string" ? body.license : (body.license?.type ?? null),
        unpackedSize: body.dist?.unpackedSize ?? null,
        dependencies: Object.keys(body.dependencies ?? {}),
        optionalDependencies: Object.keys(body.optionalDependencies ?? {}),
        browser: Boolean(body.browser),
        bin: Boolean(body.bin),
        description: body.description ?? "",
      };
      cache[candidate.name] = meta;
    }
    if (!meta) continue;
    results.push({ group: candidate.group, ...meta, verdict: licenseVerdict(meta.license) });
  }
  return results;
}

// --- Parte 3: candidato sem dependência (Intl.Segmenter) ------------------

const SAMPLE = [
  "O Sr. Sócrates era ateniense. Ele perguntou: “o que é filosofia?”",
  "Dra. Silva respondeu: “nada se aprende sem esforço”. Estudo Java e C#? Sim!",
];

function probeIntlSegmenter() {
  if (typeof Intl.Segmenter !== "function") return { available: false };
  const segments = [];
  for (const line of SAMPLE) {
    for (const part of new Intl.Segmenter("pt", { granularity: "sentence" }).segment(line)) {
      segments.push(part.segment.trim());
    }
  }
  return { available: true, node: process.version, segments };
}

// --- Relatório -------------------------------------------------------------

function table(rows, columns) {
  const header = `| ${columns.map((column) => column.label).join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map((column) => column.get(row)).join(" | ")} |`);
  return [header, divider, ...body].join("\n");
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const installed = await scanInstalled();

  let cache = {};
  try {
    cache = JSON.parse(await readFile(cacheFile, "utf8"));
  } catch {
    cache = {};
  }
  const candidates = await fetchCandidates(cache);
  await writeFile(cacheFile, JSON.stringify(cache, null, 2));
  const intl = probeIntlSegmenter();

  const declared = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"))
    .devDependencies;

  const byLicense = installed.reduce((acc, item) => {
    const key = item.license ?? "(sem licença)";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const summary = {
    installedCount: installed.length,
    installedSizeBytes: installed.reduce((sum, item) => sum + item.sizeBytes, 0),
    byLicense,
    withLicenseFile: installed.filter((item) => item.licenseFile).length,
    verdicts: installed.reduce((acc, item) => {
      acc[item.verdict] = (acc[item.verdict] ?? 0) + 1;
      return acc;
    }, {}),
    native: installed.filter((item) => item.native).map((item) => item.name),
    declared,
    installed,
    candidates,
    intlSegmenter: intl,
  };
  await writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));

  const direct = installed.filter((item) => declared[item.name]);
  const transitive = installed.filter((item) => !declared[item.name]);
  const columns = (withVersion) => [
    { label: "pacote", get: (row) => `\`${row.name}\`` },
    ...(withVersion ? [{ label: "versão", get: (row) => row.version }] : []),
    { label: "licença", get: (row) => row.license ?? "?" },
    { label: "arquivo de licença", get: (row) => (row.licenseFile ? "sim" : "**não**") },
    { label: "MB", get: (row) => mb(row.sizeBytes) },
    { label: "nativo", get: (row) => (row.native ? "sim" : "não") },
    { label: "veredito", get: (row) => row.verdict },
  ];

  console.log("## Pacotes instalados: declarados na raiz\n");
  console.log(table(direct, columns(true)));
  console.log("\n## Pacotes instalados: transitivos\n");
  console.log(table(transitive, columns(false)));
  console.log(
    `\n**Total:** ${num(summary.installedCount)} pacotes · ${mb(summary.installedSizeBytes)} MB · ` +
      `licenças: ${JSON.stringify(byLicense)} · arquivo de licença: ` +
      `${num(summary.withLicenseFile)}/${num(summary.installedCount)} · ` +
      `vereditos: ${JSON.stringify(summary.verdicts)} · ` +
      `nativos: ${summary.native.join(", ") || "nenhum"}\n`,
  );

  console.log("## Candidatos (registro npm)\n");
  console.log(
    table(candidates, [
      { label: "grupo", get: (row) => row.group },
      { label: "pacote", get: (row) => `\`${row.name}\`` },
      { label: "versão", get: (row) => row.version },
      { label: "licença", get: (row) => row.license ?? "?" },
      { label: "MB (descompactado)", get: (row) => (row.unpackedSize ? mb(row.unpackedSize) : "?") },
      { label: "deps", get: (row) => num(row.dependencies.length) },
      { label: "bin", get: (row) => (row.bin ? "sim" : "não") },
      { label: "campo browser", get: (row) => (row.browser ? "sim" : "não") },
      { label: "veredito", get: (row) => row.verdict },
    ]),
  );

  console.log("\n## Candidato sem dependência: `Intl.Segmenter` (nativo do runtime)\n");
  console.log(`- disponível: ${intl.available ? "sim" : "não"} · runtime: ${intl.node ?? "?"}`);
  if (intl.segments) {
    console.log(`- frases detectadas em \`pt\` na amostra fixa: ${num(intl.segments.length)}`);
    for (const segment of intl.segments) console.log(`  - \`${segment}\``);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
