# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E8 CONCLUÍDA (2026-10-29, 4 tarefas, ADR-088–092)** — fechada com as medições Android (3/3 condições da ADR-005 passaram). E7 CONCLUÍDA (2026-10-21, ADR-071–077); E6 (ADR-070); E5/E4/E3 fechadas.
- **Próxima tarefa:** **E9-T01 (cópia de 2026-10-29) · Spike: opções de OCR** — comparar tesseract.js (WASM, Apache-2.0), OCR nativo do Android (ML Kit, via plugin) e serviços locais; medir qualidade em pt e en (livros antigos), tempo e tamanho. **Aceite:** `spikes/S6-ocr.md` com recomendação.
- **Ação pendente do PO:** não apagar a entrega (Release) `corpus-public-v1`; git desde 2026-10-14 (**ADR-054**) o agente faz sozinho com o `gh`.
- **Status:** `pnpm verify` verde (1083 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0; baseline do bench no ar (16 docs, calibrada no CI).
- **Última atualização:** 2026-10-29 (E8 fechada: medições Android 3/3, ADR-092, OPEN-QUESTIONS 3 respondida).

## Tarefa fechada nesta sessão — E8-T04 (fechamento): medições Android e fim da fase E8
- **Medições no aparelho real (Redmi Note 13, 2026-10-29; checklist preenchido, prints em `<CORPUS_PRIVATE_DIR>\Testes`):** (a) `n1-en-lostworld` terminou sem travar — 667 ms/pág, p95 932 ms; (b) `n2-en-astrofisica` p95 **3.133 ms < 5.000 ms**; (c) memória via `adb dumpsys meminfo` — ocioso 283 MB, **pico 282 MB** (bateria 17%, números conservadores). **As 3 passaram → ADR-005 segue `accepted`, não reaberta.**
- **Decisão do PO (OPEN-QUESTIONS 3):** opção A → **ADR-092** — o orçamento de 300 MB vale no que o celular mede via `adb`; o `pnpm bench` do PC é só alarme de regressão (> 25%).
- Bench (parte do PC, PR #80, ADR-091): baseline CI-calibrada + gate `--ci`; 1083 testes, `pnpm eval --ci` exit 0. Correções do dia: PR #82 (pdfjs-dist no `--serve`), PR #83 (progresso por página no bench do celular).

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-29 — E8-T04 FECHADA, fase E8 CONCLUÍDA** (medições Android feitas com o PO na mesma sessão; ADR-092; OPEN-QUESTIONS 3 respondida). **Feito:** checklist preenchido (3/3 condições da ADR-005: lostworld 667 ms/pág sem travar, astrofisica p95 3.133 ms < 5.000, memória pico 282 MB via adb); ADR-005 com a evidência (segue `accepted`); ADR-092 criada + índice (`pnpm decisions:index` = 92 ADRs); OPEN-QUESTIONS 3 movida para o archive; fase E8 com bloco de fechamento; ARCHITECTURE decisão 8 com os números do aparelho. **Próxima tarefa:** E9-T01 (spike S6-OCR) — já copiada para "Tarefa atual". **Armadilhas:** `adb` no PC só via caminho completo `C:\Users\<usuario>\platform-tools\adb.exe` (fora do PATH); chamada direta `& $adb` congela o shell do agente — usar `Start-Process` com redirect (ou o caminho completo no PowerShell do PO); servidor do bench exige rede **Privada** no firewall e o IP `10.0.0.154` (192.168.56.1 e 172.22.192.1 são adaptadores virtuais, não servem).

## Bloqueios / ações do humano (PO) (só abertos; passo a passo na mensagem do report-to-po)
- [ ] Não apagar a entrega (Release) `corpus-public-v1`: o `corpus/manifest.yaml` aponta para ela (apagar = CI vermelho com 404).

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
| E9, E10, SEG | todo (E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 31 documentos (16 públicos + 15 privados); 12 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 12 · `para_boundary_f1` **1,0000 nos 12** · `reading_order` **1,0000 nos 12** (E6-T02 leu as colunas na ordem; era 0,1429) · `header_footer_f1` 1,0000 nos 12 · `hyphen_join_acc` 1,0000 nos 12 (ADR-047) · `style_f1` 1,0000 nos 12 (E4-T01/T05) · `heading_f1` **1,0000 nos 12** · `heading_level_acc` **1,0000 nos 12** (E6-T04 corrigiu o spec do sintético de colunas, ADR-070) · `footnote_link_acc` 1,0000 nos 12 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` **1,0000 nos 12** (E6-T04: medida por banda; era 0,5556 em `syn-n2-en-columns`) · `confidence_calibration` **1,0000 nos 12** (E7-T01, ADR-071; sem bloco errado nos sintéticos).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-29 · **E8-T04 (fechamento): medições Android + fim da E8 — CONCLUÍDO** · 3/3 condições da ADR-005 passaram no aparelho do PO (lostworld 667 ms/pág sem travar; astrofisica p95 3.133 ms < 5.000; memória pico 282 MB via `adb`), ADR-005 segue `accepted`; ADR-092 (orçamento 300 MB vale no celular) + OPEN-QUESTIONS 3 respondida; **fase E8 fechada**.
- 2026-10-29 · **E8-T04 (parte do PC): benchmarks reproduzíveis — CONCLUÍDO** · `pnpm bench` (worker novo por documento, RSS natural, baseline calibrada no CI, gate `--ci` avisa > 25%), roteiro Android, ADR-091; **1083 testes** (+38), `pnpm eval --ci` exit 0; PR #80 mesclado.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md`, `archive/STATE-handoff-2026-10-22.md`, `archive/STATE-log-2026-10-27-e8t03.md`, `archive/STATE-log-2026-10-28-e8t02.md`, `archive/STATE-log-2026-10-28-e8t03-fatia3.md` (E7-T02/T03; E7-T04 ver ADR-074/075; fila 3A sofia/n2/n4 = PR #67; E8-T01 fatia 1 = ADR-088).

Histórico completo: docs/extractor/archive/
