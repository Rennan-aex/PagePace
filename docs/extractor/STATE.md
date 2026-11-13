# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **SEG concluída (2026-11-12)** — T01–T05 done; E10/E9/E8/E7/E6/E5/E4/E3/E2/E1/E0 fechadas. Nenhuma tarefa aberta no extrator.
- **Próxima tarefa:** **M0/M2 do app** — espera o PO liberar o M0 (`docs/app/STATE.md`). Nenhuma tarefa aberta no extrator.
- **Ação pendente do PO:** liberar o M0 do app.
- **Status:** **PUB-02 (READMEs e documentação de entrada) — CONCLUÍDA e mesclada em 2026-11-13 (PR #9, squash `f063107`)**: README raiz EN/PT-BR, READMEs dos 5 pacotes, tests/, corpus/, docs/README, scripts/, apps/, .opencode/; 109 links relativos conferidos (0 quebrados), todos os comandos executados, números do `pnpm eval` conferidos, `pnpm verify` verde. **PUB-01 concluída e mesclada em 2026-11-13 (PR #1, squash)**: LICENSE (MIT), THIRD_PARTY.md, package.json raiz+5, CONTRIBUTING, SECURITY, ISSUE/PR templates, dependabot.
- **Última atualização:** 2026-11-13 (PUB-02 mesclada, PR #9).

## Tarefa atual
Nenhuma. Última concluída: **PUB-02 — READMEs e documentação de entrada** (PR #9).

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **PUB-02 encerrada e mesclada (PR #9, squash `f063107`).** README raiz EN + README.pt-BR; READMEs dos 5 pacotes com exemplos `tsx` executados; tests/, corpus/ (EN), docs/README (índice pt), scripts/, apps/, .opencode/.
- **Verificação desta sessão:** 109 links relativos = 0 quebrados; exemplos `tsx` dos 4 pacotes e o `pagepace inspect` reproduzidos linha a linha; contagens de teste conferidas (`vitest run` por pacote: 71/181/748/360/46 = 1406 em 93 arquivos); números do README = saída real do `pnpm eval`; `pnpm verify` verde (42,3 s); tempos do quick start remedidos (install 0,9 s, fetch 2,0 s, verify 42,3 s). Correção feita: OCR não é "aguardando" — é adaptador opcional (`--ocr`).
- **Próximo passo:** o PO libera o M0 do app; depois abrir a fase M0 em `docs/app/` e seguir para o M2. Nada pendente no extrator.

## Bloqueios / ações do humano (PO) (só abertos; passo a passo na mensagem do report-to-po)
- Liberar o M0 do app (fases e tarefas) para o M2 começar.

## Progresso por marco
| Marco | Status |
|---|---|
| E0 | done (2026-10-05, PR #11) |
| E1 | done (2026-10-07, PR #22) |
| E2 | done (2026-10-08, PR #28; checklist manual concluído 2026-10-11) |
| E3 | done (2026-10-11, PRs #29–#34; checklist manual concluído 2026-10-11) |
| E4 | done (T01 PR #38, T02 PR #40, T03 PR #42, T04 PR #43, T05 PR #44) |
| E5 | done (T01 PR #45; T02 PR #46; T03 PR #48; T04 PR #50; T05 PR #51; T06 PR #52; T07 PR #53; T08 PR #54 — fase fechada 2026-10-18) |
| E6 | done (T01 PR #56, T02 PR #57, T03, T04 — fase fechada 2026-10-19, ADR-070) |
| E7 | done (T01–T05 done 2026-10-20/21, ADR-071/072/073/074/075/076/077 — fase fechada 2026-10-21) |
| E8 | **done** (T01–T04 — fase fechada 2026-10-29; ADR-088/089/090/091/092; medições Android 3/3) |
| E9 | **done** (T01–T04 done 2026-10-30/11-02, ADR-093–098 — fase fechada 2026-11-02; E9 = OCR da ADR-018) |
| E10 | **done** (T01a/T01b/T02/T03/T04 — fase fechada 2026-11-11; ADR-100/101/102; recorte = ADR-016 + ADR-075) |
| SEG | **done** (T01–T05 done 2026-11-11/12; ADR-104–109) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 31 documentos (16 públicos + 15 privados); 12 com gabarito (sintéticos `syn-*`) + **4 documentos de frases** em `corpus/sentences/`.
- `text_cer` 0,0000 nos 12 · `para_boundary_f1` **1,0000 nos 12** · `reading_order` **1,0000 nos 12** (E6-T02 leu as colunas na ordem; era 0,1429) · `header_footer_f1` 1,0000 nos 12 · `hyphen_join_acc` 1,0000 nos 12 (ADR-047) · `style_f1` 1,0000 nos 12 (E4-T01/T05) · `heading_f1` **1,0000 nos 12** · `heading_level_acc` **1,0000 nos 12** (E6-T04 corrigiu o spec do sintético de colunas, ADR-070) · `footnote_link_acc` 1,0000 nos 12 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` **1,0000 nos 12** (E6-T04: medida por banda; era 0,5556 em `syn-n2-en-columns`) · `confidence_calibration` **1,0000 nos 12** (E7-T01, ADR-071; sem bloco errado nos sintéticos) · `sentence_f1` **1,0000 nos 4** documentos anotados (SEG-T05, ADR-108; meta 0,97; 22/13 pt, 24/12 en).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-11-13 · **PUB-02 (READMEs e documentação de entrada) — CONCLUÍDO (PR #9, squash `f063107`)** · README raiz EN + README.pt-BR (badges, status honesto, diagrama mermaid, quick start com tempos reais, CLI real do vendored com atribuição CC BY, tabela do `pnpm eval`, mapa, docs, "how it is built", acks); READMEs dos 5 pacotes (exemplos tsx executados); tests/ e corpus/ README; docs/README (índice pt), scripts/, apps/, .opencode/; 109 links relativos = 0 quebrados; números do `pnpm eval` conferidos; `pnpm verify` verde (1406 testes, 42,3 s); CI `verify` verde antes do merge.
- 2026-11-13 · **PUB-01 (arquivos legais e da comunidade) — CONCLUÍDO (PR #1, squash)** · conferência pré-publicação (git/CI/config do GitHub ok; `.env.example` era a única falta; greps só com placeholders); LICENSE MIT, THIRD_PARTY.md, package.json raiz+5 (private intacto, lockfile intacto), .editorconfig, CONTRIBUTING.md, SECURITY.md, ISSUE_TEMPLATE x3 + PR template em inglês, dependabot.yml; `pnpm verify` verde, `pnpm eval --ci` exit 0. Próxima: M0/M2 do app (PO).
- Sessões anteriores: 2026-11-12 SEG-T05 (`archive/STATE-log-2026-11-12-segt05.md`), 2026-11-11 SEG-T04 (PR #110, ADR-107), `archive/STATE-log-2026-11-11-segt03.md`, `archive/STATE-log-2026-11-11-segt02.md`, `archive/STATE-log-2026-11-11-corpus-vendored.md`, `archive/STATE-log-2026-11-11-e10t04.md`, `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md`, `archive/STATE-handoff-2026-10-22.md`, `archive/STATE-log-2026-10-27-e8t03.md`, `archive/STATE-log-2026-10-28-e8t02.md`, `archive/STATE-log-2026-10-28-e8t03-fatia3.md`, `archive/STATE-log-2026-11-02-e9t04.md`.

Histórico completo: docs/extractor/archive/
