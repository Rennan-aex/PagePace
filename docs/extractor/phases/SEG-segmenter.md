# SEG · Segmentador de frases e palavras (pt/en)

**Requisitos:** REQ-SEG-01..03. **Depende de:** E1 (pacote e CI). **Pode ser feito em paralelo a E2–E6; precisa estar pronto antes do M2 do app.**
**Critério de saída:** suíte de casos pt/en passando; documentação de como estender abreviações.

## Tarefas
### SEG-T01 · API e testes tabelados
- `splitSentences(text, { lang })` → offsets; `splitWords(text)` → tokens `{ text, start, end }` com pontuação anexada (`"tempo,"`), mantendo aspas/parênteses junto da palavra de forma consistente. **Aceite:** tipos exportados; testes tabelados (≥ 60 casos pt+en) escritos antes da implementação.
### SEG-T02 · Frases
- Fim por `. ! ?` e reticências; **abreviações** pt (Sr., Sra., Dr., Dra., Prof., etc., p., pp., cap., v., ex.) e en (Mr., Mrs., Dr., e.g., i.e., vs., Fig.); números/decimais (`3.14`, `1.000,50`); iniciais (`J. S. Mill`); aspas e diálogos (`— Disse ele.`); fim de frase seguido de aspas/parênteses.
- **Aceite:** testes de cada categoria; lista de abreviações em arquivo de dados por idioma (fácil de estender).
### SEG-T03 · Palavras
- Hifens compostos como uma palavra (`guarda-chuva`), apóstrofos (`don't`, `d'água`), números com separadores, travessão `—` como separador, URLs/emails como um token. **Aceite:** testes.
### SEG-T04 · Idioma misto e robustez
- Frases com trechos em grego/latim; texto vazio; só pontuação; textos muito longos sem pontuação (limite máximo de trecho configurável). **Aceite:** testes de propriedade simples (tokens cobrem o texto sem sobreposição, offsets monotônicos).
### SEG-T05 · Avaliação
- Pequeno corpus anotado de frases (domínio público) em pt/en e métrica `sentence_f1`; entra no baseline. **Aceite:** meta ≥ 0,97 em prosa comum.
