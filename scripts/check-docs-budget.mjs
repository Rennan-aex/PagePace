#!/usr/bin/env node
// Docs context budget (DOCS-T01): fails when a "hot" file grows past its
// limit. Everything removed from a hot file must move to
// docs/extractor/archive/ — never be deleted.
// Run: pnpm check:docs
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const KB = 1024;
const limits = {
  stateBytes: 8 * KB,
  stateLines: 90,
  handoffLines: 15,
  logSessions: 2,
  agentsBytes: 10 * KB,
  newAdrLines: 12,
};
const errors = [];

const read = (rel) => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");
const sectionLines = (text, heading) => {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.startsWith(heading));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  const block = end === -1 ? rest : rest.slice(0, end);
  return block.filter((line) => line.trim() !== "").length;
};

const stateRel = "docs/extractor/STATE.md";
const state = read(stateRel);
const stateBytes = Buffer.byteLength(state, "utf8");
if (stateBytes > limits.stateBytes) {
  errors.push(
    `${stateRel}: ${stateBytes} bytes > 8 KB. Mova o excedente para docs/extractor/archive/ (Handoff velho, Log antigo, tarefas concluídas) e deixe só o atual.`,
  );
}
const stateLines = state.split("\n").length;
if (stateLines > limits.stateLines) {
  errors.push(
    `${stateRel}: ${stateLines} linhas > 90. Mova o excedente para docs/extractor/archive/ (Handoff velho, Log antigo, tarefas concluídas).`,
  );
}

const handoff = sectionLines(state, "## Handoff");
if (handoff === null) {
  errors.push(`${stateRel}: secao "## Handoff" nao encontrada.`);
} else if (handoff > limits.handoffLines) {
  errors.push(
    `${stateRel}: Handoff com ${handoff} linhas > ${limits.handoffLines}. Mova as entradas antigas para docs/extractor/archive/ e deixe só o estado atual.`,
  );
}

const log = sectionLines(state, "## Log de sessões");
if (log === null) {
  errors.push(`${stateRel}: secao "## Log de sessoes" nao encontrada.`);
} else {
  const sessions = state.split("\n").filter((line) => /^- \d{4}-\d{2}-\d{2} ·/.test(line)).length;
  if (sessions > limits.logSessions) {
    errors.push(
      `${stateRel}: log com ${sessions} sessoes > ${limits.logSessions}. Mova as entradas alem das 2 mais recentes para docs/extractor/archive/ (nada e apagado).`,
    );
  }
}

const agentsRel = "AGENTS.md";
const agentsBytes = Buffer.byteLength(read(agentsRel), "utf8");
if (agentsBytes > limits.agentsBytes) {
  errors.push(
    `${agentsRel}: ${agentsBytes} bytes > 10 KB. Enxugue o texto movendo detalhe historico para docs/extractor/archive/ — as regras invioláveis ficam.`,
  );
}

const decisionsRel = "docs/extractor/DECISIONS.md";
if (existsSync(join(root, decisionsRel))) {
  const decisions = read(decisionsRel);
  const blocks = [];
  const lines = decisions.split("\n");
  let current = null;
  for (const line of lines) {
    const heading = /^### (ADR-(\d+))\b/.exec(line);
    if (heading) {
      if (current) blocks.push(current);
      current = { id: heading[1], number: Number(heading[2]), lines: 1 };
    } else if (current) {
      if (line.startsWith("### ") || line.startsWith("## ")) {
        blocks.push(current);
        current = null;
      } else {
        current.lines += 1;
      }
    }
  }
  if (current) blocks.push(current);
  const last = blocks.reduce((max, block) => (block.number > max.number ? block : max), {
    number: -1,
    lines: 0,
    id: "-",
  });
  if (last.lines > limits.newAdrLines) {
    errors.push(
      `${decisionsRel}: o ADR mais recente (${last.id}) tem ${last.lines} linhas > ${limits.newAdrLines}. ADR novo deve ter no maximo 12 linhas: mova o detalhe para docs/extractor/archive/ e deixe o resumo.`,
    );
  }
} else {
  errors.push(`${decisionsRel}: arquivo nao encontrado.`);
}

if (errors.length > 0) {
  console.error("check:docs — orçamento de docs estourado:\n");
  for (const error of errors) console.error(`  - ${error}`);
  console.error(
    "\nNada é apagado: o que sair dos arquivos quentes vai para docs/extractor/archive/.",
  );
  process.exit(1);
}
console.log("check:docs ok (STATE.md, AGENTS.md, DECISIONS.md dentro do orçamento)");
