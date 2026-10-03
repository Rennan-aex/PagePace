# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.**

## Situação
- **Fase atual:** E0 (Spikes)
- **Tarefa atual:** E0-T01 (parte IA do corpus privado: feita; parte pública: pendente)
- **Status da tarefa:** `wip`
- **Branch:** `e0-t01-corpus-inicial`
- **Última atualização:** 2026-10-03

## Handoff (atualizar a cada checkpoint)
- **Feito:** inventário dos 13 PDFs de `<CORPUS_PRIVATE_DIR>` (`CORPUS_PRIVATE_DIR`, também no `.env` da raiz) e criação do manifest privado `<CORPUS_PRIVATE_DIR>\manifest.yaml` com 13 entradas (`level`, `lang`, `features` provisórios, sha256 real, `visibility: private`). Nenhum PDF dentro do repo; `pnpm verify` verde (typecheck + 5 testes + check:no-pdf). E1-T05 passou a exigir leitura de `CORPUS_PRIVATE_DIR` do ambiente e, se ausente, do `.env` da raiz. Duda não bloqueante (nome do campo de arquivo local no manifest privado) registrada em `OPEN-QUESTIONS.md` item 4.
- **Pela metade:** E0-T01 continua aberta — falta a parte pública (≥ 4 PDFs de domínio público em `corpus/manifest.yaml` com sha256, `pnpm corpus:fetch`) e falta confirmar `level`/`lang`/`features`/`title` dos PDFs privados abrindo-os (`pagepace dump-raw`, E1-T04). Cobertura atual: N1 5 (2 pt, 3 en) · N2 2 (1 pt, 1 en) · N3 4 (3 pt, 1 en) · N4 2 (0 pt, 2 en) · N5 1 (en).
- **Próximo comando/passo:** decidir se o próximo spike (E0-T02 · S1, `pagepace dump-raw` em 3 PDFs) começa agora, já que `CORPUS_PRIVATE_DIR` existe, ou se entra E1-T02 (ingestão) antes. Depois: E0-T06 (S5, auditoria de licenças) é o spike que não precisa de corpus.
- **Armadilhas conhecidas:** nenhum PDF pode ir ao git; `pnpm install` não funciona em alguns sistemas de arquivos montados (symlinks), prefira o disco local; `docs/GUIA-DO-PO.md` continua sem trackear (arquivo do PO, decisão do PO sobre versioná-lo); o corpus privado não tem `golden/` ainda.

## Bloqueios / ações do humano (PO)
- [x] Criar a pasta privada de PDFs e definir `CORPUS_PRIVATE_DIR`.
- [x] Colocar PDFs de teste na pasta (13 PDFs: atende o mínimo de 8).
- [ ] Confirmar títulos e níveis reais dos PDFs privados; `n5-en-newton.pdf` (322 KB) e `n2-pt-placasdevideo.pdf` (98 KB) parecem curtos demais para serem o documento completo.
- [ ] Confirmar se `docs/GUIA-DO-PO.md` deve ser versionado.
- [ ] Configurar proteção da `main` e exigir o check `verify` no GitHub (ver `docs/WORKFLOW.md`).
- [ ] Responder `OPEN-QUESTIONS.md` quando a IA sinalizar (item 4 trava o formato do manifest privado até a E1-T05).

## Progresso por marco
| Marco | Status |
|---|---|
| E0 | todo |
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
- 2026-10-03 · E0-T01 (parte IA) · branch `e0-t01-corpus-inicial` · 13 PDFs privados inventariados + manifest privado criado fora do repo; E1-T05 ajustada para ler `CORPUS_PRIVATE_DIR` do ambiente/`.env`; OPEN-QUESTIONS item 4 (campo de arquivo local no manifest privado) aguardando o PO. `pnpm verify` verde. Nada commitado do corpus privado.
