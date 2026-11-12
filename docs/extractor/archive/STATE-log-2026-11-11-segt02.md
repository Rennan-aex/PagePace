# Log de sessão arquivado — SEG-T02 (2026-11-11)

- 2026-11-11 · **SEG-T02 (frases) — CONCLUÍDO** · `abbreviations/{pt,en}.ts` (30+32 entradas lowercase sem ponto) + `sentences.ts` (sem mudar a API): ponto isolado após abreviação conhecida nunca quebra; inicial maiúscula sozinha (`J. S. Mill`) não quebra antes de palavra maiúscula; `3.14`/`1.000,50`, `! ? …` e runs seguem a regra anterior; 68 casos tabelados (28 novos, cada categoria pt/en) + checagem de cobertura e de formato das listas (73 testes no arquivo), ADR-105; `pnpm verify` verde, `eval --ci` exit 0. Próxima: SEG-T03.
