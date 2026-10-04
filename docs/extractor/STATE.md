# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.**

## Situação
- **Fase atual:** E0 (Spikes)
- **Tarefa atual:** E0-T02 (Spike S1: o que o PDF.js entrega) — `done` (aguardando PR/merge)
- **Status da tarefa:** `done`
- **Branch:** `e0-t02-spike-s1`
- **Última atualização:** 2026-10-04

## Handoff (atualizar a cada checkpoint)
- **Feito (E0-T02):** relatório `docs/extractor/spikes/S1-pdfjs.md` com a tabela "dado / disponível / como obter / qualidade", métricas de 5 PDFs privados (N1, N2, N3 + os 2 novos N4/N5), comparação com render e recomendação. Script commitável `packages/extractor/spikes/s1-dump.mjs` (dumps brutos em `.pagepace-cache/spikes/S1/`, gitignored — nunca commitar). Dependências registradas em **ADR-015** (`pdfjs-dist@6.4.299` Apache-2.0 e `@napi-rs/canvas@1.0.10` MIT, ambas `devDependencies` na raiz); **ADR-005** recebeu linha de evidência e segue `provisional` até o S4. Itens novos no `BACKLOG.md` (recompor acento destacado; descartar `font.data`) e `OPEN-QUESTIONS.md` item 5 (PDF escaneado: recusar/OCR?). `pnpm verify` verde (typecheck + 5 testes + check:no-pdf).
- **Achados principais (detalhe no relatório):** itens com 7 chaves invariantes; nome real da fonte só com `fontExtraProperties: true` (e aí retém `font.data` → memória); `bold`/`italic` **undefined em 110/110 fontes embutidas**; struct tree inútil nos 5 PDFs; outline só em 2/5; n4 tem 9.013 acentos destacados (92% dos solapamentos) — NFC não resolve; n5 é escaneado (0 texto, 319 imagens); 5–10 ms/página; destruir com `task.destroy()`; `standardFontDataUrl` etc. exigem caminho de arquivo puro (não `file://`).
- **Pela metade:** PR da branch `e0-t02-spike-s1` ainda não existe (sem `gh`; o PO abre pelo navegador — ver Bloqueios). Fora do escopo desta tarefa e pendente: `<CORPUS_PRIVATE_DIR>\manifest.yaml` tem **13 de 15** entradas (faltam `n4-pt-astrofisica.pdf` e `n5-pt-astrofisica.pdf`); E0-T01b (corpus público) e confirmação de `level`/`lang`/`features` seguem como estavam.
- **Próximo comando/passo:** `git push -u origin e0-t02-spike-s1` + PO abre o PR (comando no bloco abaixo). Próxima tarefa sugerida: **E0-T03 (S2, negrito/itálico)** — reaproveita `s1-dump.mjs` e as fontes já medidas; ou E0-T06 (S5, licenças), que não precisa de corpus.
- **Armadilhas conhecidas:** nenhum PDF e nenhum dump (`.pagepace-cache/`) vai ao git; `pdf.destroy()` não existe em v6 → `task.destroy()`; URLs `file://` quebram os assets do pdf.js em Node; `fontExtraProperties: true` segura os bytes da fonte na memória (n4: 308 MB); `pnpm install` não funciona em alguns sistemas de arquivos montados, prefira o disco local; `docs/GUIA-DO-PO.md` continua sem trackear; o corpus privado não tem `golden/` ainda.

## Bloqueios / ações do humano (PO)
- [ ] **Abrir o PR do spike S1** (a IA já fez o push). Abra o PowerShell na pasta do projeto e rode:
  ```powershell
  cd "C:\caminho\para\PagePace"
  git status
  ```
  Se aparecer `nothing to commit` e a branch `e0-t02-spike-s1`, abra no navegador:
  `https://github.com/Rennan-aex/PagePace/compare/main...e0-t02-spike-s1`
  clique em **Create pull request** (título: `E0 t02 spike s1 pdfjs`), depois em **Merge pull request** → **Squash and merge** → **Confirm**.
  Deu certo quando o GitHub mostrar "Merged". Se aparecer "AHEAD/BEHIND" ou pedir login, me avise.
- [ ] Confirmar títulos e níveis reais dos PDFs privados; `n5-en-newton.pdf` (322 KB) e `n2-pt-placasdevideo.pdf` (98 KB) parecem curtos demais para serem o documento completo.
- [ ] Confirmar se `docs/GUIA-DO-PO.md` deve ser versionado.
- [ ] Configurar proteção da `main` e exigir o check `verify` no GitHub (ver `docs/WORKFLOW.md`).
- [ ] Responder `OPEN-QUESTIONS.md` (itens 4 e 5) quando a IA sinalizar.

## Progresso por marco
| Marco | Status |
|---|---|
| E0 | todo (T01a done · T02 done · T01b/T03/T04/T05/T06 todo) |
| E1 | todo |
| E2 | todo |
| E3 | todo |
| E4 | todo |
| E5 | todo |
| E6 | todo |
| E7 | todo |
| E8 | todo |
| E9 | todo |
| E10 | todo |
| SEG | todo |

## Métricas atuais
(preenchido a partir do E1-T08: link para `packages/eval/baseline.json` e resumo)

## Log de sessões (mais recente em cima)
- 2026-10-04 · E0-T02 (Spike S1) · branch `e0-t02-spike-s1` · relatório S1 + ADR-015 + evidência na ADR-005; 5 PDFs medidos com `pdfjs-dist`/`@napi-rs/canvas` (devDeps); BACKLOG +2, OPEN-QUESTIONS +1 (escaneado). `pnpm verify` verde. PR pendente de abertura pelo PO.
- 2026-10-03 · E0-T01 (parte IA) · branch `e0-t01-corpus-inicial` (mergeada em `main` 2e37dd7) · 13 PDFs privados inventariados + manifest privado criado fora do repo; E1-T05 ajustada para ler `CORPUS_PRIVATE_DIR` do ambiente/`.env`; OPEN-QUESTIONS item 4 (campo de arquivo local no manifest privado) respondido → ADR-014. `pnpm verify` verde. Nada commitado do corpus privado.
