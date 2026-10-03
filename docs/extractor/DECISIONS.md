# Decisões (ADR leve)

Formato: `ADR-NNN · título · status (accepted/provisional/superseded) · data`. Contexto → decisão → consequências. Use a skill `record-decision`.

---
### ADR-001 · Monorepo único · accepted
**Contexto:** extrator e app compartilham o esquema; mudanças de contrato precisam ser atômicas.
**Decisão:** um repositório (`PagePace`) com `docs/extractor`, `docs/app`, `packages/*`, `apps/*`. Separação lógica por pastas e marcos.
**Consequências:** um PR muda esquema, produtor e consumidor juntos. Extração para outro repo é possível depois.

### ADR-002 · TypeScript em tudo, núcleo portável · accepted
**Decisão:** núcleo (schema, extractor, segmenter) em TypeScript puro, sem APIs de Node. Roda em navegador, WebView (Capacitor) e Node (CLI/testes).
**Consequências:** um código serve PC e Android; adaptadores isolam arquivos e plataforma.

### ADR-003 · Reflow em todas as telas, PDF nunca exibido · accepted
**Decisão:** o app só usa o modelo extraído (celular e PC). Única exceção: botão "ver original" na tela de correção.
**Consequências:** a qualidade da extração é crítica; a tela de correção é parte do núcleo do produto.

### ADR-004 · Correções do usuário em overlay separado · accepted
**Decisão:** correções não alteram o `Book`; são `Overlay` reaplicável por âncoras.
**Consequências:** reprocessar com extrator melhor não perde trabalho manual; `unapplied` é mostrado ao usuário.

### ADR-005 · PDF.js como base da ingestão · provisional (confirmar no E0)
**Decisão:** usar PDF.js (Apache-2.0) para ler itens de texto. Critério de revisão: o spike E0 mostra que não entrega fonte/posição suficientes ou é inviável em desempenho no Android.

### ADR-006 · Licenças: sem AGPL/GPL como dependência · accepted
**Decisão:** MuPDF/PyMuPDF (AGPL) e Poppler (GPL) servem só como referência de estudo. Dependências devem ser MIT/BSD/Apache/ISC. Licença do projeto fica para depois (repo privado).

### ADR-007 · Política de corpus · accepted
**Decisão:** PDFs nunca no git. Públicos: `corpus/manifest.yaml` (com SHA-256) + script de download para `corpus/public/` (ignorado). Privados: fora do repo, `CORPUS_PRIVATE_DIR`; gabaritos privados também fora do git. Gabaritos de PDFs públicos entram em `corpus/golden/`.

### ADR-008 · Regra de ouro das métricas · accepted
**Decisão:** o CI falha se qualquer métrica do baseline piorar além da tolerância (0,002 absoluto, configurável por métrica). Atualizar o baseline exige justificativa em DECISIONS.md.

### ADR-009 · Ferramental provisório: pnpm + Vitest + TypeScript estrito · provisional
**Decisão:** pnpm workspaces, Vitest, `tsc --noEmit`. Lint/format (ESLint/Prettier ou Biome) a decidir na tarefa E1-T00.

### ADR-010 · Fluxo para uma IA por vez (OpenCode) · accepted
**Decisão:** tarefas atômicas, `STATE.md` como handoff com checkpoints, commits WIP frequentes, AGENTS.md curto e explícito, skills em `.opencode/skills/`. Sem worktrees paralelos.

### ADR-011 · Idiomas · accepted
**Decisão:** docs/skills/comunicação em pt-BR; código, commits e branches em inglês.

### ADR-012 · Palavras fora do modelo · accepted
**Decisão:** `Book` guarda blocos com runs; tokenização em palavras é do `segmenter`. Fim de parágrafo vem da estrutura (nunca da pontuação); fim de frase vem do segmentador.

### ADR-013 · Gabaritos sintéticos programáticos · provisional
**Decisão:** além de PDFs tagged, pares PDF+EPUB e páginas anotadas à mão, gerar PDFs sintéticos a partir de uma especificação (ex.: com pdfkit/pdf-lib, MIT) cuja especificação é o próprio gabarito. A escolha da ferramenta é feita na E1-T07 após checar licença e capacidade (negrito/itálico, colunas, notas).
