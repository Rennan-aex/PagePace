---
name: record-decision
description: Use sempre que escolher entre alternativas técnicas ou de produto, aceitar uma piora de métrica, adicionar dependência ou mudar o plano. Registra uma ADR curta em DECISIONS.md para que a próxima IA entenda o porquê.
---

# Registrar decisão

Abra `docs/extractor/DECISIONS.md` (ou `docs/app/DECISIONS.md`) e acrescente no fim, com o próximo número:

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
