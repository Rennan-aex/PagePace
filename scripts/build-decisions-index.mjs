#!/usr/bin/env node
// Regenerates the ADR index table between <!-- INDEX:START --> and
// <!-- INDEX:END --> at the top of docs/extractor/DECISIONS.md.
// It parses the "### ADR-NNN · title · status" headings and never
// rewrites the ADR bodies. Run: pnpm decisions:index
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2] ?? join(root, "docs", "extractor", "DECISIONS.md");
const START = "<!-- INDEX:START -->";
const END = "<!-- INDEX:END -->";

const source = readFileSync(target, "utf8");
const lines = source.split("\n");
const start = lines.indexOf(START);
const end = lines.indexOf(END);
if (start === -1 || end === -1 || end < start) {
  console.error(`build-decisions-index: markers ${START} / ${END} not found in ${target}`);
  process.exit(1);
}

const rows = [];
for (const line of lines) {
  const match = /^### (ADR-\d+) · (.+?) · (accepted|provisional|superseded|proposed)\b/.exec(line);
  if (match) {
    rows.push(`| ${match[1]} | ${match[2]} | ${match[3]} |`);
  }
}
if (rows.length === 0) {
  console.error(`build-decisions-index: no "### ADR-NNN" heading found in ${target}`);
  process.exit(1);
}

const table = ["| ID | Título | Status |", "|---|---|---|", ...rows];
const next = [...lines.slice(0, start + 1), ...table, ...lines.slice(end)];
writeFileSync(target, next.join("\n"), "utf8");
console.log(`build-decisions-index: ${rows.length} ADR(s) indexed in ${target}`);
