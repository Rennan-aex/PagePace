# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.**

## Situação
- **Fase atual:** E0 (Spikes)
- **Tarefa atual:** E0-T04 (Spike S3: struct tree) — **concluída, esperando PR da branch**
- **Status da tarefa:** `done` (pull request em aberto, aguardando merge do PO)
- **Branch:** `e0-t04-spike-s3` (criada a partir de `main` = `975af6d`, PR #6 já mergeado)
- **Última atualização:** 2026-10-04

## Handoff (atualizar a cada checkpoint)
- **Sessão encerrada (2026-10-04) — E0-T04 concluída:** relatório **`docs/extractor/spikes/S3-tagged.md`** escrito e script **`packages/extractor/spikes/s3-structtree.mjs`** commitados; fase `E0-spikes.md` marcada `done` com resultado; manifest privado ganhou a feature **`tagged` em n1-en-sofia, n1-en-curinga e n4-en-fisica** (os 3 com árvore utilizável e 100% de cobertura) e as notas de pendência foram atualizadas (`tagged` agora verificado; `scanned` segue pendente). **Números:** 5/15 com `StructTreeRoot`, 4/15 com `Marked=true`, 3/15 confiáveis; **1 `H1` no corpus inteiro, 0 `H2`–`H6`** (árvore não serve para títulos da E4); n1-en-lostworld = árvore vazia com `Marked=true` (falso positivo) e n3-pt-filosofia = 9 nós/2 páginas → **sem** `tagged`; n1-en-curinga = `Sect` invertido dentro de `P` + 19.461 `Span` com `alt` repetido. **Uso recomendado:** só como confirmação de parágrafos (E2) e de figuras com `bbox` (E10), após validação (árvore não vazia ≥90% das páginas e sem hierarquia invertida). Próximo passo: `pnpm verify` → commit → push → PR → skill `report-to-po`.
- **Sessão (2026-10-04):** decisões do PO sobre PDFs escaneados com camada OCR invisível registradas (lista abaixo), relatório S2 recalculado separando os 2 PDFs `scanned-ocr-layer` e spike S3 feito.
- **Decisões do PO sobre scans com OCR embutido (2026-10-04) — registradas na ADR-019:** (1) E9 (OCR próprio) **não** muda de prioridade, continua como está; (2) **E1-T03 ampliada**: além de "0 itens de texto", detectar texto invisível (`Tr 3`); se a maior parte dos caracteres das páginas for invisível, o documento ganha o aviso **`ocr-text-layer`** — extrai o texto existente normalmente, com confiança mais baixa, **sem** negrito/itálico, e o app avisa que o texto pode ter erros; dois estados distintos no modelo e no app: **"sem texto: aguardando OCR"** × **"texto de OCR embutido: leitura com aviso"**; item do BACKLOG removido; (3) corpus: `n1-en-lostworld` e `n3-en-filosofia` recebem a feature **`scanned-ocr-layer`**, **não contam nas metas de N1/N3** (baseline separada) e falta um PDF **digital** de filosofia em inglês para o N3 (anotado em CORPUS.md); (4) relatório do S2 passa a mostrar as estatísticas de estilo **separando** esses dois livros dos demais; (5) `GUIA-DO-PO.md` é versionado e a proteção da `main` já está configurada.
- **Feito (E0-T03 / Spike S2, sessão 2026-10-04):** script `packages/extractor/spikes/s2-styles.mjs` rodou nos **15 PDFs** privados (409 fontes, 0 falhas) e o relatório **`docs/extractor/spikes/S2-styles.md`** está escrito. Números-chave: **257/257 fontes de texto decididas pelo nome (100%, 0 desconhecidas)**; sem a tabela de convenções (CM/SF/TeX) cai para **186/257 (72%)** e erra **10.286 letras** (negrito 4.017, itálico 5.082, papel 1.187 — tudo em n4-pt, n4-en e n2-en); flags `bold`/`italic` do pdf.js `undefined` em **409/409**; OS/2/head conflitam com o nome em **37 casos** (18 em fontes de texto = 7%), todos `fs=0/mac=0/w=500` nos subsets TeX → **bytes valem só como confirmação**; **nenhum negrito por contorno** (`Tr` 2/5/6 = 0) e **1 caso de itálico simulado** (corte de ~8°, 107 letras em n3-pt, `Avenir-Heavy`/`Avenir-Roman`); largura dos glifos separa negrito (+5–15% na mesma família) mas não itálico (1,013) e dá 0,63–1,60 no controle regular÷regular → confirmação fraca. Validação visual em 5 PNGs (SFBX negrito, SFTI itálico, CMBX+CMTI, shear, scan).
- **Decisão ainda não registrada em `DECISIONS.md`:** a estratégia recomendada para a E4 (**nome PostScript → convenção → token → default regular; bytes só corroborando**) precisa virar ADR quando a E4 a adotar (neste spike só foi medida, não adotada). Próxima sessão que mexer na E4: registrar com a skill `record-decision` (próximo número livre: **020** — as ADR-016/017/018 já estão no `main` pelo PR #5 e a **ADR-019** (camada OCR invisível) entrou nesta branch pelo PR em aberto).
- **Feito (sessão 2026-10-04 · respostas do PO):** PR do spike S1 mergeado (`main` = `5949c93`, PR #4). Três ADRs novas: **ADR-016** (recorte de figuras/tabelas/equações só no modo normal, exceção à ADR-003; linha de exceção acrescentada na ADR-003), **ADR-017** (Biome, `provisional`, confirmar licença/funcionamento na E1-T00), **ADR-018** (PDF escaneado: detectar, não extrair, aviso `PDF escaneado: leitura exige OCR, livro aguardando OCR`). `OPEN-QUESTIONS.md`: perguntas 1, 3 e 5 movidas para Respondidas; item 4 também consolidado lá (já tinha ADR-014) e duplicata removida — só a **pergunta 2** (fontes de PDFs públicos, E0-T01b) segue aberta. Ajustes de fase: **E1-T03** redescrita conforme ADR-018; nova **E3-T01b** (recomposição de acento destacado LaTeX, P1, saiu do BACKLOG); **E8-T03** agora inclui o descarte de `font.data` (só planejar, sem implementar). Decisão do PO sobre corpus: **`n5-pt-astrofisica.pdf` = nível N5, idioma pt**. `pnpm verify` verde.
- **Achado novo (foi para o BACKLOG):** 2 PDFs têm **camada OCR invisível** (`Tr 3`, 1.166.930 caracteres: n1-en-lostworld 426.329 + n3-en-filosofia 740.601) — a regra de escaneado da ADR-018 ("0 itens de texto") **não pega** eles. Item no `BACKLOG.md` (P2).
- **Pela metade:** `<CORPUS_PRIVATE_DIR>\manifest.yaml` continua com **13 de 15** entradas — faltam `n4-pt-astrofisica.pdf` e `n5-pt-astrofisica.pdf` (n5 já com nível/idioma confirmados pelo PO: N5/pt; **n4 ainda sem nível confirmado**). E0-T01b (corpus público) e confirmação dos demais níveis/títulos seguem como estavam.
- **Próximo comando/passo:** (a) rodar `pnpm verify`, commitar tudo que está pendente nesta branch, `git push -u origin e0-t04-spike-s3` e abrir o PR com a skill `end-session`/`.github/pull_request_template.md`; (b) o PO abre o PR pelo navegador e junta (merge) — passos na mensagem de fim de sessão; (c) depois do merge, próxima tarefa da fase E0 = **E0-T05 (Spike S4: desempenho)**, começando pelo protocolo de início de sessão.
- **Armadilhas conhecidas:** nenhum PDF e nenhum dump (`.pagepace-cache/`) vai ao git; `pdf.destroy()` não existe em v6 → `task.destroy()`; URLs `file://` quebram os assets do pdf.js em Node; `fontExtraProperties: true` segura os bytes da fonte na memória (n4: 308 MB — item do BACKLOG ligado à E8-T03); o render de página em PDFs com `view` deslocado exige usar `page.view` na hora de recortar (senão o crop sai em branco — corrigido em `render-crop.mjs`); `pnpm install` não funciona em alguns sistemas de arquivos montados, prefira o disco local; `docs/GUIA-DO-PO.md` continua sem trackear; o corpus privado não tem `golden/` ainda.
## Bloqueios / ações do humano (PO)
- [x] Abrir o PR do spike S1 — feito: PR #4 mergeado (`5949c93`).
- [ ] Confirmar títulos e níveis dos PDFs privados que faltam. Já confirmado pelo PO (2026-10-04): `n5-pt-astrofisica.pdf` = **N5, pt**. Ainda aberto: nível/título do `n4-pt-astrofisica.pdf`; e os suspeitos de sempre — `n5-en-newton.pdf` (322 KB) e `n2-pt-placasdevideo.pdf` (98 KB) parecem curtos demais para ser o documento completo.
- [x] Confirmar se `docs/GUIA-DO-PO.md` deve ser versionado — **sim, versionar** (decisão do PO, 2026-10-04).
- [x] Configurar proteção da `main` e exigir o check `verify` no GitHub — **feito** (decisão do PO, 2026-10-04).
- [x] Abrir o PR da branch `docs/po-decisions-e0` — feito: PR #5 mergeado (`e6a439f`).
- [x] Abrir o PR da branch `e0-t03-spike-s2` — feito: PR #6 mergeado (`975af6d`).

## Progresso por marco
| Marco | Status |
|---|---|
| E0 | todo (T01a done · T02 done · T03 done · T04 done · T01b/T05/T06 todo) |
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
- 2026-10-04 · E0-T04 (Spike S3) + decisões do PO sobre camada OCR · branch `e0-t04-spike-s3` · relatório S3 + `s3-structtree.mjs`; ADR-018 ampliada + **ADR-019**; E1-T03 com detectores A/B; S2 recalculado em 2 grupos (nativo 13 × OCR 2, `summary.groups`); manifest privado: `scanned-ocr-layer` em 2 PDFs e `tagged` em 3; fase marcada `done`. `pnpm verify` verde.
- 2026-10-04 · E0-T03 (Spike S2) · branch `e0-t03-spike-s2` · relatório S2 + `s2-styles.mjs` + BACKLOG (camada OCR invisível × ADR-018) + fase marcada `done`; 15 PDFs medidos, 257/257 fontes decididas pelo nome; `DECISIONS.md` não tocado — ADR da estratégia fica para a E4. `pnpm verify` verde.
- 2026-10-04 · docs (respostas do PO) · branch `docs/po-decisions-e0` · ADR-016/017/018 registradas; OPEN-QUESTIONS 1/3/5 → Respondidas (e 4 consolidada); E1-T03 ajustada; E3-T01b criada (P1); E8-T03 ligada ao `font.data`; BACKLOG atualizado; n5 = N5/pt. `pnpm verify` verde.
- 2026-10-04 · E0-T02 (Spike S1) · branch `e0-t02-spike-s1` → PR #4 mergeado (`5949c93`) · relatório S1 + ADR-015 + evidência na ADR-005; 5 PDFs medidos com `pdfjs-dist`/`@napi-rs/canvas` (devDeps); BACKLOG +2, OPEN-QUESTIONS +1 (escaneado, depois respondida → ADR-018). `pnpm verify` verde.
- 2026-10-03 · E0-T01 (parte IA) · branch `e0-t01-corpus-inicial` (mergeada em `main` 2e37dd7) · 13 PDFs privados inventariados + manifest privado criado fora do repo; E1-T05 ajustada para ler `CORPUS_PRIVATE_DIR` do ambiente/`.env`; OPEN-QUESTIONS item 4 (campo de arquivo local no manifest privado) respondido → ADR-014. `pnpm verify` verde. Nada commitado do corpus privado.
