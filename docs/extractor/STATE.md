# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.**

## Situação
- **Fase atual:** E0 (Spikes)
- **Tarefa atual:** E0-T01 (preparar corpus inicial: depende do humano, ver abaixo)
- **Status da tarefa:** `todo`
- **Branch:** (nenhuma ainda)
- **Última atualização:** (preencher)

## Handoff (atualizar a cada checkpoint)
- **Feito:** planejamento completo e esqueleto do monorepo (`pnpm verify` verde com testes de fumaça).
- **Pela metade:** nada.
- **Próximo comando/passo:** ler `phases/E0-spikes.md`; começar por E0-T02 (spike PDF.js) assim que houver ao menos 5 PDFs em `CORPUS_PRIVATE_DIR` ou `corpus/public/`.
- **Armadilhas conhecidas:** nenhum PDF pode ir ao git; `pnpm install` não funciona em alguns sistemas de arquivos montados (symlinks), prefira o disco local.

## Bloqueios / ações do humano (PO)
- [ ] Criar a pasta privada de PDFs e definir `CORPUS_PRIVATE_DIR`.
- [ ] Colocar PDFs de teste na pasta (ver `CORPUS.md` para a distribuição desejada por nível e idioma).
- [ ] Configurar proteção da `main` e exigir o check `verify` no GitHub (ver `docs/WORKFLOW.md`).
- [ ] Responder `OPEN-QUESTIONS.md` quando a IA sinalizar.

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
- (vazio)
