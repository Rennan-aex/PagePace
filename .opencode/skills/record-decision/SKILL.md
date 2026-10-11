---
name: record-decision
description: Use sempre que escolher entre alternativas técnicas ou de produto, aceitar uma piora de métrica, adicionar dependência ou mudar o plano. Registra uma ADR curta em DECISIONS.md para que a próxima IA entenda o porquê.
---

# Registrar decisão

Acrescente o ADR **no fim** de `docs/extractor/DECISIONS.md` (ou `docs/app/DECISIONS.md`) **sem abrir o arquivo inteiro** (ele é FRIO — ver "Leitura econômica" no AGENTS.md):

1. **Próximo número:** `Select-String -Path docs\extractor\DECISIONS.md -Pattern '^### ADR-' | Select-Object -Last 1` — o próximo número é o maior + 1.
2. **Acrescente com `Add-Content`** (nunca reescreva o arquivo): monte o ADR num here-string simples (`$adr = @' ... '@`, que começa ao fim da linha) e rode `Add-Content -Path docs\extractor\DECISIONS.md -Encoding utf8 -Value $adr`.
3. **Atualize o índice do topo:** `pnpm decisions:index` (o script só reescreve a tabela entre `<!-- INDEX:START -->` e `<!-- INDEX:END -->`; os ADRs não são tocados).
4. **Confira o orçamento:** `pnpm check:docs` — o ADR mais recente pode ter **no máximo 12 linhas**; se precisar de mais, mova o detalhe para `docs/extractor/archive/` e deixe o resumo.

Formato (máximo 12 linhas):

```
### ADR-0NN · <título> · <accepted|provisional> · <AAAA-MM-DD>
**Contexto:** o problema e as restrições (2–4 linhas).
**Alternativas:** A (prós/contras) · B (prós/contras).
**Decisão:** o que foi escolhido e por quê.
**Consequências:** o que muda, o que fica mais difícil, quando revisar.
```

## Quando é obrigatório
Nova dependência (licença MIT/BSD/Apache/ISC? tamanho? roda no navegador?) · mudança de esquema · piora aceita de métrica (e atualização de baseline) · alteração de marcos/ordem do roadmap · escolha de ferramenta (lint, validação, OCR...) · qualquer coisa que um humano perguntaria "por que fizeram assim?".

Se a decisão depende do PO e muda o rumo do produto, **não decida**: escreva em `OPEN-QUESTIONS.md` e pare a tarefa.
