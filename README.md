# PagePace

> Leitor para leitura profunda: reconstrói o PDF como texto reflowable (parágrafos, títulos, notas, estilos) e oferece leitura dinâmica por trechos com pausas, leitura normal com anotações e TTS. Android + PC.
>
> *A reader for deep reading. It rebuilds PDFs as reflowable text and offers chunk-based paced reading with pauses, a normal mode with annotations, and TTS. Android + desktop.*

**Status:** planejamento concluído, implementação não iniciada. Próximo passo: ver `docs/extractor/STATE.md`.

## A ideia em 30 segundos

O usuário adiciona um PDF (livro de filosofia, artigo, livro técnico). O PagePace **nunca mostra o PDF**: extrai o texto com a estrutura (títulos, parágrafos, negrito/itálico, notas de rodapé) para um **modelo intermediário** versionado, e todos os modos de leitura usam só esse modelo:

1. **Leitura dinâmica (pacer):** palavra por palavra em velocidade configurável (padrão 400 ppm), com **pausa ao fim de cada trecho** (frase, parágrafo ou página) para o leitor decidir se avança ou relê. O produto é centrado nessas pausas.
2. **Leitura normal:** páginas reconstruídas (2 no PC, subpáginas no celular), marca-texto, sublinhado e anotações salvas na hora, com uma aba central de anotações.
3. **Text to speech:** voz do dispositivo (ou local) com a palavra atual destacada.

## Estrutura do repositório

```
AGENTS.md            ponto de entrada para qualquer IA (leia primeiro)
docs/
  WORKFLOW.md        git, ciclo GSD, protocolo de sessão
  extractor/         planejamento do extrator PDF -> modelo (projeto 1, começa primeiro)
  app/               planejamento do app (rascunho; detalhado quando o extrator amadurecer)
  templates/         modelos de tarefa e de fase
.opencode/skills/    receitas para as IAs (OpenCode descobre automaticamente)
packages/            schema, extractor, segmenter, eval, cli
apps/reader/         o app (depois)
corpus/              manifest, gabaritos (golden) e PDFs públicos (ignorados pelo git)
tests/manual/        checklists de conferência visual
scripts/             utilitários (corpus, verificações)
```

## Começando

```bash
pnpm install
pnpm verify        # typecheck + testes + checagem de que nenhum PDF está no git
```

Requisitos: Node 20+ e pnpm 9. Os PDFs de teste **não** ficam no repositório, ver `corpus/README.md`.

## Documentação

| Quero... | Leia |
|---|---|
| Trabalhar como IA/dev | `AGENTS.md`, depois `docs/extractor/STATE.md` |
| Entender o extrator | `docs/extractor/PROJECT.md`, `ARCHITECTURE.md`, `SCHEMA.md` |
| Ver o plano | `docs/extractor/ROADMAP.md` e `docs/extractor/phases/` |
| Entender o app | `docs/app/PROJECT.md` e `docs/app/READING-MODES.md` |
| Entender o processo | `docs/WORKFLOW.md` |

## Licença

A definir (repositório privado por enquanto). Ver `docs/extractor/DECISIONS.md` (ADR-006) sobre restrições de licença de dependências.
