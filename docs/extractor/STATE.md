# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.**

## Situação
- **Fase atual:** E0 (Spikes)
- **Tarefa atual:** E0-T03 (Spike S2: detecção de negrito/itálico) — `todo`
- **Status da tarefa:** `todo` (esta sessão só registrou decisões do PO em docs)
- **Branch:** `docs/po-decisions-e0` (docs desta sessão); próxima tarefa criar `e0-t03-…` a partir de `main`
- **Última atualização:** 2026-10-04

## Handoff (atualizar a cada checkpoint)
- **Feito (sessão 2026-10-04 · respostas do PO):** PR do spike S1 mergeado (`main` = `5949c93`, PR #4). Três ADRs novas: **ADR-016** (recorte de figuras/tabelas/equações só no modo normal, exceção à ADR-003; linha de exceção acrescentada na ADR-003), **ADR-017** (Biome, `provisional`, confirmar licença/funcionamento na E1-T00), **ADR-018** (PDF escaneado: detectar, não extrair, aviso `PDF escaneado: leitura exige OCR, livro aguardando OCR`). `OPEN-QUESTIONS.md`: perguntas 1, 3 e 5 movidas para Respondidas; item 4 também consolidado lá (já tinha ADR-014) e duplicata removida — só a **pergunta 2** (fontes de PDFs públicos, E0-T01b) segue aberta. Ajustes de fase: **E1-T03** redescrita conforme ADR-018; nova **E3-T01b** (recomposição de acento destacado LaTeX, P1, saiu do BACKLOG); **E8-T03** agora inclui o descarte de `font.data` (só planejar, sem implementar). Decisão do PO sobre corpus: **`n5-pt-astrofisica.pdf` = nível N5, idioma pt**. `pnpm verify` verde.
- **Pela metade:** `<CORPUS_PRIVATE_DIR>\manifest.yaml` continua com **13 de 15** entradas — faltam `n4-pt-astrofisica.pdf` e `n5-pt-astrofisica.pdf` (n5 já com nível/idioma confirmados pelo PO: N5/pt; **n4 ainda sem nível confirmado**). E0-T01b (corpus público) e confirmação dos demais níveis/títulos seguem como estavam.
- **Próximo comando/passo:** commit + push da branch `docs/po-decisions-e0` e PR (a IA faz o push; o PO abre o PR pelo navegador). Depois, próxima tarefa: **E0-T03 (S2)** — medir quanto o nome da fonte basta para negrito/itálico, reaproveitando `packages/extractor/spikes/s1-dump.mjs` e as 110 fontes já medidas (flags `bold`/`italic` vieram `undefined` em todas).
- **Armadilhas conhecidas:** nenhum PDF e nenhum dump (`.pagepace-cache/`) vai ao git; `pdf.destroy()` não existe em v6 → `task.destroy()`; URLs `file://` quebram os assets do pdf.js em Node; `fontExtraProperties: true` segura os bytes da fonte na memória (n4: 308 MB — item do BACKLOG ligado à E8-T03); `pnpm install` não funciona em alguns sistemas de arquivos montados, prefira o disco local; `docs/GUIA-DO-PO.md` continua sem trackear; o corpus privado não tem `golden/` ainda.

## Bloqueios / ações do humano (PO)
- [x] Abrir o PR do spike S1 — feito: PR #4 mergeado (`5949c93`).
- [ ] Confirmar títulos e níveis dos PDFs privados que faltam. Já confirmado pelo PO (2026-10-04): `n5-pt-astrofisica.pdf` = **N5, pt**. Ainda aberto: nível/título do `n4-pt-astrofisica.pdf`; e os suspeitos de sempre — `n5-en-newton.pdf` (322 KB) e `n2-pt-placasdevideo.pdf` (98 KB) parecem curtos demais para ser o documento completo.
- [ ] Confirmar se `docs/GUIA-DO-PO.md` deve ser versionado.
- [ ] Configurar proteção da `main` e exigir o check `verify` no GitHub (ver `docs/WORKFLOW.md`).
- [ ] Quando eu sinalizar: abrir o PR da branch `docs/po-decisions-e0` (comando e endereço na mensagem de fim de sessão).

## Progresso por marco
| Marco | Status |
|---|---|
| E0 | todo (T01a done · T02 done · T01b/T03/T04/T05/T06 todo) |
| E1 | todo (T03 redescrita pela ADR-018 · T00 com ADR-017 provisória) |
| E2 | todo |
| E3 | todo (T01b nova, P1 — acento LaTeX) |
| E4 | todo |
| E5 | todo |
| E6 | todo |
| E7 | todo |
| E8 | todo (T03 inclui descarte de `font.data`) |
| E9 | todo (OCR; começa do estado "aguardando OCR" da ADR-018) |
| E10 | todo (recortes de figuras pela ADR-016) |
| SEG | todo |

## Métricas atuais
(preenchido a partir do E1-T08: link para `packages/eval/baseline.json` e resumo)

## Log de sessões (mais recente em cima)
- 2026-10-04 · docs (respostas do PO) · branch `docs/po-decisions-e0` · ADR-016/017/018 registradas; OPEN-QUESTIONS 1/3/5 → Respondidas (e 4 consolidada); E1-T03 ajustada; E3-T01b criada (P1); E8-T03 ligada ao `font.data`; BACKLOG atualizado; n5 = N5/pt. `pnpm verify` verde.
- 2026-10-04 · E0-T02 (Spike S1) · branch `e0-t02-spike-s1` → PR #4 mergeado (`5949c93`) · relatório S1 + ADR-015 + evidência na ADR-005; 5 PDFs medidos com `pdfjs-dist`/`@napi-rs/canvas` (devDeps); BACKLOG +2, OPEN-QUESTIONS +1 (escaneado, depois respondida → ADR-018). `pnpm verify` verde.
- 2026-10-03 · E0-T01 (parte IA) · branch `e0-t01-corpus-inicial` (mergeada em `main` 2e37dd7) · 13 PDFs privados inventariados + manifest privado criado fora do repo; E1-T05 ajustada para ler `CORPUS_PRIVATE_DIR` do ambiente/`.env`; OPEN-QUESTIONS item 4 (campo de arquivo local no manifest privado) respondido → ADR-014. `pnpm verify` verde. Nada commitado do corpus privado.
