# AGENTS.md: leia isto primeiro

Você é uma IA trabalhando no **PagePace**, um monorepo (TypeScript). Pode haver troca de IA a qualquer momento (os tokens da sessão anterior acabam). Tudo o que você precisa saber para continuar está **no repositório**, não na memória de ninguém. Seja explícito, pequeno e verificável.

## Idiomas
- **Docs, skills e comunicação com o usuário:** português (pt-BR).
- **Código, identificadores, comentários, mensagens de commit e nomes de branch:** inglês.

## Comunicação com o PO (obrigatório)
O PO é iniciante, está sozinho no projeto e usa **Windows com PowerShell**. Ele não conhece o vocabulário de git, CI ou terminal. Por isso:
- Ao **terminar a sessão**, e sempre que for **pedir algo ou perguntar algo** a ele, use a skill `report-to-po`. Leia-a inteira antes de escrever a mensagem.
- Fale em português simples, em frases curtas. Explique cada termo técnico na primeira vez, em poucas palavras, entre parênteses.
- Nunca diga só "veja o arquivo X" ou "item 4 do OPEN-QUESTIONS": escreva a pergunta ou o passo completo na própria mensagem.
- Nunca peça ao PO algo que você mesmo pode fazer. Se precisar da ajuda dele, dê o passo a passo com comandos de **PowerShell**, como saber que deu certo e o que fazer se der erro.
- Toda mensagem final termina com o texto exato do prompt da próxima sessão.
- Cada item que você escrever em "Bloqueios / ações do humano" (STATE.md) deve ser executável sozinho: comandos incluídos.

## Protocolo de INÍCIO de sessão (obrigatório, nesta ordem)
1. Leia `docs/extractor/STATE.md` (ou `docs/app/STATE.md` se o trabalho for do app). Ele diz a tarefa atual, o que está pela metade e o próximo comando.
2. Leia o arquivo da fase indicado e **apenas a tarefa atual** (`docs/extractor/phases/`).
3. `git status` e `git branch --show-current`. Se há trabalho não commitado, ele é da sessão anterior: entenda-o antes de qualquer coisa.
4. Rode `pnpm verify`. Se falhar antes de você tocar em algo, conserte ou registre em STATE.md antes de seguir.
5. Entre na branch da tarefa (`e2-t03-detect-paragraphs`) ou crie-a a partir de `main`.
Atalho: a skill `start-session` faz isso.

## Durante a sessão
- **Uma tarefa por vez.** Não amplie o escopo. Ideia nova ou problema fora da tarefa vai para `docs/extractor/BACKLOG.md`, não para o código.
- **Commit pequeno e frequente** (`wip: ...` é permitido na branch da tarefa). Nada deve existir só no disco.
- **Checkpoint em STATE.md** (bloco "Handoff") depois de cada passo relevante: feito / pela metade / próximo comando. Você pode ser interrompido sem aviso.
- Antes de qualquer mudança arriscada ou grande, faça um commit WIP.
- Se algo for ambíguo e mudar o rumo do produto: **não decida sozinho**. Registre em `docs/extractor/OPEN-QUESTIONS.md` (ou `docs/app/OPEN-QUESTIONS.md`), marque a tarefa como `blocked` e pare.

## Protocolo de FIM de sessão
Atalho: skill `end-session`.
1. `pnpm verify` e a avaliação do corpus (`pnpm eval`, quando existir) devem passar.
2. Marque a tarefa na fase (`[x]`), atualize `STATE.md` (estado, próximo passo, bloqueios) e `DECISIONS.md` se houve decisão.
3. Commit, push, abra PR (use `.github/pull_request_template.md`).

## Regras invioláveis
1. **Nenhum PDF no git, nunca.** Públicos: `corpus/public/` (ignorado, baixado por script). Privados: fora do repositório, via `CORPUS_PRIVATE_DIR`. Nenhum texto de livro com copyright em gabaritos, fixtures, issues ou PRs.
2. **Regra de ouro das métricas:** nenhuma mudança de heurística é aceita se piorar qualquer métrica do baseline. Piora justificada exige registro em `DECISIONS.md` e atualização explícita do baseline.
3. **O app nunca lê PDF.** Só o extrator toca no PDF. O contrato entre eles é `@pagepace/schema`.
4. **Mudança no esquema** exige: bump de versão, nota em `SCHEMA.md` (changelog), entrada em `DECISIONS.md`, migração se for breaking. Skill: `evolve-schema`.
5. **Dependências:** proibido AGPL/GPL (MuPDF, PyMuPDF, Poppler são só referência de estudo). Antes de adicionar qualquer dependência: licença (MIT/BSD/Apache/ISC), tamanho, e se roda no navegador/WebView. Registre em `DECISIONS.md`.
6. **Núcleo portável:** `schema`, `extractor` (núcleo), `segmenter` não podem usar APIs exclusivas de Node (`fs`, `path`...) fora de adaptadores/CLI.
7. **Determinismo:** mesma entrada, mesma saída. Sem `Date.now()`/aleatoriedade na lógica de extração.
8. **`main` é protegida e sempre verde.** Trabalhe em branch, abra PR, squash merge, Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
9. **Sem decisões silenciosas.** Se escolheu entre alternativas, escreveu em `DECISIONS.md`.

## Definição de pronto (uma tarefa)
Critérios de aceite da tarefa cumpridos, testes automatizados escritos (ou justificativa), `pnpm verify` verde, avaliação sem regressão, docs de estado atualizados, PR aberto.

## Mapa de skills (`.opencode/skills/`)
| Skill | Quando usar |
|---|---|
| `start-session` / `end-session` | Início e fim de toda sessão |
| `plan-task` | Quebrar uma fase em tarefas atômicas |
| `add-heuristic` | Criar/alterar heurística do extrator com segurança |
| `write-golden-test` | Criar gabarito e teste golden |
| `add-corpus-pdf` | Adicionar PDF ao corpus (público ou privado) |
| `run-eval` | Rodar e interpretar a avaliação |
| `debug-page` | Investigar uma página que extraiu errado |
| `evolve-schema` | Alterar o contrato |
| `record-decision` | Registrar decisão (ADR) |

## Onde está o quê
`docs/WORKFLOW.md` (processo) · `docs/extractor/` (planejamento do extrator) · `docs/app/` (planejamento do app) · `corpus/README.md` (como funciona o corpus) · `tests/manual/` (checklists visuais).
