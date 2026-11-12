# Log arquivado: SEG-T03 (palavras) — 2026-11-11

- 2026-11-11 · **SEG-T03 (palavras) — CONCLUÍDO** · `words.ts` quebra em `—` (U+2014) e emite cada travessão como token próprio mesmo colado (`ele—disse`); hífen composto, apóstrofo (reto e `’`), separadores numéricos e URLs/e-mails nunca quebram, pontuação final anexada (ADR-104); 26 casos novos → 56 tabelados + 3 meta (59 testes), cobertura ≥ 2 por categoria e mínimo de 50, ADR-106; `pnpm verify` verde, `eval --ci` exit 0. Próxima: SEG-T04.
