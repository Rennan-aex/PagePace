---
name: evolve-schema
description: Use ao alterar o contrato do PagePace (@pagepace/schema: RawDocument, Book, Overlay, Anchor). Aplica versionamento semântico, migração, changelog, tag e atualização de produtores e consumidores no mesmo PR.
---

# Evoluir o esquema

O esquema é o único contrato entre extrator e app. Trate cada mudança como uma mudança de API pública.

## Classifique a mudança
- **PATCH:** só documentação/esclarecimento.
- **MINOR:** campo **opcional** novo ou tipo de bloco novo; consumidores antigos seguem funcionando.
- **MAJOR:** remoção/renomeação/mudança de significado; exige migração.

## Passos
1. Escreva a motivação (problema que o esquema atual não resolve) e a alternativa descartada.
2. Altere os tipos e validadores em `packages/schema` e adicione fixtures **válidas e inválidas**.
3. Atualize `docs/extractor/SCHEMA.md` (texto e changelog) e `SCHEMA_VERSION`.
4. **MAJOR:** implemente `migrate(vN → vN+1)` + teste com um `Book` antigo real.
5. Atualize **no mesmo PR** os produtores (`extractor`) e consumidores (`eval`, `cli`, e `apps/reader` se existir).
6. `record-decision` (ADR curta). Após o merge, crie a tag `schema-vX.Y.Z`.
7. `pnpm verify` e `pnpm eval` verdes (os goldens podem precisar de migração; documente).

Nunca altere o esquema "de passagem" dentro de uma tarefa de heurística; abra tarefa própria.
