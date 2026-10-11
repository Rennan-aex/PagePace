# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** E3 (Limpeza) — T01…T05 `done` e na `main` (PRs #29–#34).
- **Tarefa atual:** E4-T01 — Estilos inline (definição abaixo, copiada em 2026-10-11). A anterior, DOCS-T01 "dieta de contexto", está concluída (definição: `archive/TASK-DOCS-T01-2026-10-11.md`).
- **Ação pendente do PO:** abrir o PR da branch `docs-dieta-contexto` e dar Squash and merge.
- **Status:** `pnpm verify` verde (481 testes + `check:docs`); branch `docs-dieta-contexto` (de `origin/main` `593846b`).
- **Última atualização:** 2026-10-11.

## Tarefa atual — E4-T01 · Estilos inline (negrito, itálico, sup, sub) (cópia de `phases/E4-headings-styles.md`; copiada em 2026-10-11)
- A partir do resultado do spike S2: nome da fonte + flags; casos de sobrescrito por tamanho/posição; produzir `runs`.
- **Aceite:** `style_f1` ≥ meta em N1; `runs` adjacentes com o mesmo estilo são fundidos; testes de fronteiras (estilo no meio da palavra).

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- Sessão iniciada (2026-10-11) — DOCS-T01 começando: branch `docs-dieta-contexto` de `origin/main` `593846b` (PR #34 da E3-T05 já mergeado). Medição "antes" guardada na mensagem ao PO (STATE 148,4 KB · DECISIONS 132,3 KB · AGENTS 5,8 KB).
- Sessão encerrada (2026-10-11) — DOCS-T01 concluída: `pnpm verify` verde (481 testes + `check:docs`), 3 commits (`1961180`, `e2386ec`, `711cdad`) na `docs-dieta-contexto`. Próximo: o PO abre o PR e dá Squash and merge.
- Feito: STATE enxuto (148,4 → 5,3 KB), índice de ADRs + `pnpm decisions:index`, OPEN-QUESTIONS fatiado, AGENTS.md com "Leitura econômica", skills `start-session`/`end-session`/`record-decision` atualizadas, `check:docs` no `verify` e no CI, ADR-050.
- Cuidado: STATE/DECISIONS só via `Select-String`/faixas de linha, nunca inteiros; se o orçamento estourar, mova conteúdo para `docs/extractor/archive/`.
- Se a sessão cair no meio: este Handoff é o bastão.

## Bloqueios / ações do humano (PO) (só abertos; passo a passo na mensagem do report-to-po)
- [ ] Checklist manual da fase E2 (`phases/E2-lines-paragraphs.md`): `pnpm -s pagepace extract <caminho\do\livro.pdf>` em 2 livros N1; dizer, numa frase, se os parágrafos parecem certos.
- [ ] Checklist manual da fase E3 (`phases/E3-cleanup.md`): conferir cabeçalhos/rodapés removidos em 2 livros e a hifenização em 3 páginas de livro pt.
- [ ] Confirmar os títulos reais dos 15 PDFs privados do corpus (hoje vêm do nome do arquivo).
- [ ] Não apagar a entrega (Release) `corpus-public-v1`: o `corpus/manifest.yaml` aponta para ela (apagar = CI vermelho com 404).
- [ ] Abrir o PR da branch `docs-dieta-contexto` e dar Squash and merge (o push é feito pela IA).

## Progresso por marco
| Marco | Status |
|---|---|
| E0 | done (2026-10-05, PR #11) |
| E1 | done (2026-10-07, PR #22) |
| E2 | done (2026-10-08, PR #28; checklist manual pendente) |
| E3 | done (2026-10-11, PRs #29–#34; checklist manual pendente) |
| E4…E10, SEG | todo (E8 descarta `font.data`; E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 26 documentos (11 públicos + 15 privados); 7 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 7 · `para_boundary_f1` 1,0000 em 6 e 0,0000 em `syn-n2-en-columns` · `reading_order` 1,0000 nos 6 de coluna única e 0,1429 em `syn-n2-en-columns` (duas colunas = alvo da E6) · `header_footer_f1` 1,0000 nos 7 · `hyphen_join_acc` 1,0000 nos 7 (ADR-047).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-11 · **DOCS-T01 (dieta de contexto) — CONCLUÍDA (push feito, falta só o PR)** · STATE.md 148,4 KB → 7,3 KB (histórico integral em `archive/STATE-full-2026-10-10.md`); AGENTS.md ganhou a seção “Leitura econômica” (5,8 → 6,4 KB); perguntas respondidas do OPEN-QUESTIONS → `archive/OPEN-QUESTIONS-ANSWERED.md`.
  Índice `ID | título | status` no topo de DECISIONS.md (`pnpm decisions:index`, ADRs não tocados) + ADR-050; `pnpm check:docs` ligado ao `verify` e ao CI (STATE ≤ 8 KB/90 linhas, Handoff ≤ 15, log ≤ 2 sessões, AGENTS ≤ 10 KB, ADR novo ≤ 12 linhas).
  Skills `start-session`/`end-session`/`record-decision` atualizadas; `pnpm verify` verde (481 testes + `check:docs`); definição da tarefa arquivada em `archive/TASK-DOCS-T01-2026-10-11.md`.
- 2026-10-11 · **E3-T05 (fontes com mapeamento quebrado) — CONCLUÍDA (PR #34 mergeado)** · `brokenfont.ts`: U+FFFD + PUA, quebra em AND com piso 3 caracteres e share ≥ 5%; `buildBook` marca `flags: ["broken-font-mapping"]`, confiança ≤ 0,3, texto preservado; `avgConfidence` = média das confianças dos blocos · +16 testes → verify verde (481) · sonda 26 PDFs: 2 blocos só em `n4-pt-astrofisica` p.315 · `pnpm eval --ci` exit 0, baseline intocado · ADR-049 accepted.
- Sessões anteriores: `docs/extractor/archive/STATE-full-2026-10-10.md` (seções "Handoff" e "Log de sessões").

Histórico completo: docs/extractor/archive/
