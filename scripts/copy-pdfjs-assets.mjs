#!/usr/bin/env node
// Copies the runtime assets of `pdfjs-dist` to a target folder.
//
// ADR-020: the app may only ship the Foxit `.pfb` fonts (BSD). The 4
// `LiberationSans*.ttf` files that come with `pdfjs-dist` are GPLv2 and are
// never copied - extraction does not depend on them (spike S5), only the
// rendering of non-embedded base-14 fonts changes, and by less than 2%.
//
//   node scripts/copy-pdfjs-assets.mjs --from node_modules/pdfjs-dist --to dist/assets
//
// Exit code 1 on a missing source folder or when nothing was copied.

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Extensions ADR-020 allows in the bundle. */
const ALLOWED_EXTENSIONS = new Set([".pfb", ".bcmap", ".cmap", ".wasm"]);
/** License file of the Foxit fonts we do redistribute. */
const ALLOWED_FILES = new Set(["LICENSE_FOXIT"]);
/** Explicit deny list: GPL material must never leave this script. */
const DENIED_FILES = new Set(["LICENSE_LIBERATION"]);
/** One folder of `pdfjs-dist` per sub-path, mapped to its destination. */
const SOURCES = [
  { from: "standard_fonts", to: "standard_fonts" },
  { from: "cmaps", to: "cmaps" },
  { from: "wasm", to: "wasm" },
];

export function isAllowedAssetFile(fileName) {
  if (DENIED_FILES.has(fileName)) return false;
  if (ALLOWED_FILES.has(fileName)) return true;
  return ALLOWED_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

async function walk(dir, base, collected) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return collected;
  }
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    const relative = path.posix.join(base, entry.name);
    if (entry.isDirectory()) {
      await walk(absolute, relative, collected);
    } else if (entry.isFile() && isAllowedAssetFile(entry.name)) {
      collected.push({ absolute, relative });
    }
  }
  return collected;
}

export async function collectAssetFiles(fromDir) {
  const collected = [];
  for (const source of SOURCES) {
    await walk(path.join(fromDir, source.from), source.to, collected);
  }
  return collected;
}

export async function copyPdfjsAssets(fromDir, toDir) {
  const files = await collectAssetFiles(fromDir);
  for (const file of files) {
    const destination = path.join(toDir, file.relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(file.absolute));
  }
  return files.map((file) => file.relative).sort();
}

function parseArgs(argv) {
  const args = { from: "", to: "" };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === "--from" || flag === "-f") args.from = argv[++index] ?? "";
    if (flag === "--to" || flag === "-t") args.to = argv[++index] ?? "";
  }
  return args;
}

const isMain = Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href);
if (isMain) {
  const { from, to } = parseArgs(process.argv.slice(2));
  if (!from || !to) {
    console.error(
      "usage: node scripts/copy-pdfjs-assets.mjs --from <pdfjs-dist dir> --to <dest dir>",
    );
    process.exit(1);
  }
  try {
    const copied = await copyPdfjsAssets(from, to);
    if (copied.length === 0) {
      console.error(`no allowed asset found under ${from}`);
      process.exit(1);
    }
    for (const relative of copied) console.log(relative);
    console.log(`copied ${copied.length} files to ${to}`);
  } catch (error) {
    console.error(String(error));
    process.exit(1);
  }
}
