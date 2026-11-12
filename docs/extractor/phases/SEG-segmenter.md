# SEG · Segmentador de frases e palavras (pt/en)

**Requisitos:** REQ-SEG-01..03. **Depende de:** E1 (pacote e CI). **Pode ser feito em paralelo a E2–E6; precisa estar pronto antes do M2 do app.**
**Critério de saída:** suíte de casos pt/en passando; documentação de como estender abreviações.

## Tarefas
### SEG-T01 · API e testes tabelados · `done`
- `splitSentences(text, { lang })` → offsets; `splitWords(text)` → tokens `{ text, start, end }` com pontuação anexada (`"tempo,"`), mantendo aspas/parênteses junto da palavra de forma consistente. **Aceite:** tipos exportados; testes tabelados (≥ 60 casos pt+en) escritos antes da implementação.
- **Resultado (2026-11-11):** **`done` — `packages/segmenter/src/{types,sentences,words,index}.ts` + ADR-104.** Tipos exportados (`SegmentLang`, `SplitSentencesOptions`, `SentenceSpan`, `WordToken`); `splitSentences` devolve spans aparados e só quebra após `. ! ? …` (runs `...`/`?!`) seguidos de espaço/fim, absorvendo fechamentos `" ' ” ’ » ) ] }`; `splitWords` = trecho sem espaço, com pontuação/aspas anexadas; idioma fora de `pt|en` → `RangeError`. **Testes escritos antes da implementação:** 43 casos de frase + 32 de palavra (70 tabelados, pt+en), invariantes de offset (monotônicos, sem sobreposição, só espaço fora dos spans/tokens), determinismo e forma da API.
### SEG-T02 · Frases · `done`
- Fim por `. ! ?` e reticências; **abreviações** pt (Sr., Sra., Dr., Dra., Prof., etc., p., pp., cap., v., ex.) e en (Mr., Mrs., Dr., e.g., i.e., vs., Fig.); números/decimais (`3.14`, `1.000,50`); iniciais (`J. S. Mill`); aspas e diálogos (`— Disse ele.`); fim de frase seguido de aspas/parênteses.
- **Aceite:** testes de cada categoria; lista de abreviações em arquivo de dados por idioma (fácil de estender).
- **Resultado (2026-11-11):** **`done` — `packages/segmenter/src/abbreviations/{pt,en}.ts` + ADR-105.** Listas lowercase sem o ponto final (30 pt + 32 en; multi-ponto guarda o interno, `e.g`), comparadas sem diferenciar maiúsculas; ponto isolado depois de abreviação conhecida não quebra; inicial maiúscula sozinha só não quebra se a próxima palavra começa com maiúscula; `! ? …`, runs de pontos e decimais (`3.14`, `1.000,50`) mantêm a regra da ADR-104; API inalterada. Testes: 28 casos novos (abreviações pt/en, iniciais, decimais, diálogo `—`, fechamento após fim de frase) → 68 tabelados + 5 meta (73 no arquivo), com checagem de cobertura por categoria e de formato das listas.
### SEG-T03 · Palavras · `done`
- Hifens compostos como uma palavra (`guarda-chuva`), apóstrofos (`don't`, `d'água`), números com separadores, travessão `—` como separador, URLs/emails como um token. **Aceite:** testes.
- **Resultado (2026-11-11):** **`done` — `words.ts` + ADR-106.** `splitWords` quebra em `—` (U+2014) e emite cada travessão como token próprio, mesmo colado (`ele—disse` → `ele`, `—`, `disse`); hífen composto, apóstrofo (reto e `’`), separadores numéricos (`1.000,50`, `1,000.50`) e URLs/e-mails nunca quebram; pontuação final segue anexada (ADR-104). API inalterada. Testes: 26 casos novos → 56 tabelados + 3 meta (59 no arquivo), cobertura ≥ 2 por categoria e mínimo de 50 casos; `pnpm verify` verde, `pnpm eval --ci` exit 0 (baseline intocado).
### SEG-T04 · Idioma misto e robustez
- Frases com trechos em grego/latim; texto vazio; só pontuação; textos muito longos sem pontuação (limite máximo de trecho configurável). **Aceite:** testes de propriedade simples (tokens cobrem o texto sem sobreposição, offsets monotônicos).
### SEG-T05 · Avaliação
- Pequeno corpus anotado de frases (domínio público) em pt/en e métrica `sentence_f1`; entra no baseline. **Aceite:** meta ≥ 0,97 em prosa comum.
