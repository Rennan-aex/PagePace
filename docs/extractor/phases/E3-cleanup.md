# E3 · Limpeza: cabeçalhos/rodapés, hifenização, junção, unicode

**Objetivo:** texto limpo e contínuo, pronto para leitura dinâmica.
**Requisitos:** REQ-EXT-06, 07, 18.
**Depende de:** E2.
**Critério de saída:** metas `header_footer_f1`, `hyphen_join_acc` e `text_cer` atingidas em N1–N3.

## Tarefas

### E3-T01 · Normalização unicode · `done`
- NFC, ligaduras (ﬁ ﬂ ﬀ ﬃ ﬄ), soft hyphen (U+00AD), aspas/apóstrofos consistentes, espaços não separáveis, caracteres de controle.
- **Aceite:** tabela de casos testada; gregos e latinos acentuados preservados; sem alteração de letras de pt (ç, ã, õ, etc.).
- **Resultado (2026-10-08):** **`done` — `pnpm verify` verde com 366 testes (+16) e `pnpm eval --ci` exit 0 (nenhuma métrica mudou: regra de ouro cumprida).**
  - **(1) `packages/extractor/src/unicode.ts`** — duas funções puras no núcleo (exportadas por `@pagepace/extractor`): **`normalizeUnicode(text)`** aplica NFC → expande as 5 ligaduras `ﬀ ﬁ ﬂ ﬃ ﬄ` → remove soft hyphen (U+00AD) → converte tab em espaço (newline fica, marcadores de linha) → remove caracteres de controle C0/C1/DEL por comparação de code point (o Biome proíbe regex com caracteres de controle — `isControlCode`/`stripControls`). **`normalizeForReader(text)`** = o anterior + espaços não separáveis (NBSP U+00A0, figure space U+2007, narrow NBSP U+202F) viram espaço regular + aspas tipográficas (`‘’‚‛` → `'` · `“”„‟` → `"`) dobram para ASCII. **Acentos de espaçamento (`´ \` ˜ ˆ` isolados) não são tocados** — são caracteres reais e o caso LaTeX é a E3-T01b. Função **idempotente** e **determinística**.
  - **(2) Aplicação:** `buildBook` passa o texto de cada run por `normalizeForReader` (e o `normalizeForHash` reutiliza a mesma função, então o ID continua estável); `normalizeText` do `@pagepace/eval` (usado por `text_cer`, `para_boundary_f1` e `reading_order`) delega para `normalizeForReader` + colapso de espaços — **os dois lados da comparação têm a mesma forma**, então aspas curly do golden × retas do `Book` nunca contam como erro.
  - **(3) Testes +16:** `unicode.test.ts` (**14** — tabela completa: NFC, soft hyphen, 5 ligaduras, 3 variantes de NBSP, 2 classes de aspas, remoção de controles, tab→espaço, newline preservado, grego `αβγΩ`, português `coração não`, acento de espaçamento intocado, idempotência, determinismo) + **1** em `book.test.ts` (run com ligadura+soft hyphen+NBSP+aspas → `effected a b 'hi'`) + **1** em `metrics.test.ts` (`normalizeText` espelha o extrator).
  - **(4) Regra de ouro:** `pnpm eval` "antes" e "depois" **idênticos** — `text_cer` 0,0000 nos 5 medidos, `para_boundary_f1` e `reading_order` intocados; `pnpm eval --ci` **exit 0** com `baseline.json` intocado. Os goldens sintéticos não contêm ligaduras nem aspas curly, então a mudança não move nenhum número.
  - **(5) Docs:** **ADR-044 `accepted`** (duas funções no núcleo, aspas → ASCII, eval espelha o extrator, limite: colapso de whitespace fica fora), fase, STATE.

### E3-T01b · Recomposição de acento destacado (LaTeX) · `done`
- PDFs gerados por LaTeX emitem o acento (´ ` ¸ ˜ ˆ) como **item separado sobrepondo a letra** (spike S1: 9.013 ocorrências em `n4-pt-astrofisica`, 92% dos solapamentos do arquivo; NFC não resolve porque é caractere espaçado, não combining). Compor o item de acento com o primeiro caractere do item seguinte quando as caixas se sobrepõem (`EXERC´ICIOS` → `EXERCÍCIOS`, `Solu¸c˜ao` → `Solução`).
- **Aceite:** `spaceAccent` cai para 0 em n4 sem piorar `text_cer` nos demais PDFs do corpus (regra de ouro das métricas); teste com fixture reproduzindo o padrão do LaTeX; acentos legítimos isolados (sinal de menos, aspas) não são tocados.
- **Resultado (2026-10-09):** **`done` — `pnpm verify` verde com 383 testes (+17), `pnpm eval` antes/depois idêntico e `pnpm eval --ci` exit 0 (regra de ouro cumprida).**
  - **(1) `packages/extractor/src/accents.ts`** — função pura **`composeAccentItems(page)`** no núcleo (exportada por `@pagepace/extractor`): standalone (trim só acentos) → composição **forward** (1º caractere do próximo: adjacência sem whitespace, caixas sobrepõem, fontes iguais ±1%) ou **backward** (último caractere do anterior, + gate `ovP > ovN` que protege o til de matemática `~`+`a`); **trailing** (acento no fim do item) → só forward + **reclassificação** do resto (máx. 3 rodadas, para `Solu¸c˜ao`); leading/mid-item nunca. `compose` = guard NFD (`Á`+´ nunca vira `Á́`), `ı`/`ȷ` → `i`/`j`, acento → marcador combinante, NFC, resultado precisa continuar 1 letra + marcas. **Só o texto muda, caixas nunca** (ADR-045, alternativa c1).
  - **(2) Aplicação:** `ingestPdfjs` chama `composeAccentItems(page)` antes do `parseRawDocument` — CLI, eval e testes veem a mesma forma.
  - **(3) Testes +17:** `accents.test.ts` (**13** — forward, backward p/ dígito, bloqueio `ovP<=ovN`, sem overlap/whitespace, trailing head, cadeia `¸ ˜`, ornamento 13 pt, `~Equal`/mid-item/URL, guard NFD, aliases, `toBe(page)` sem acentos, imutabilidade, determinismo) + **4** em `test/latex-accents.test.ts` (fixtures `minipdf` standalone `["EXERC","","ÍCIOS"]` e trailing `["EXERC","ÍCIOS"]`, página simples intacta, e o **aceite n4** `itemsWithSpacingAccent` spike → 0 com `skipIf`).
  - **(4) Regra de ouro:** sonda em todo o corpus privado (`.pagepace-cache/tmp/probe-accent13.txt`): **n4 9.013 → 0** (9.655 forward, 22 backward, 14 bloqueados), n2-en 16 → 0, **demais 13 livros com 0 aplicações** (acentos legítimos intocados); `pnpm eval` antes/depois **idênticos**, `pnpm eval --ci` exit 0.
  - **(5) Docs:** **ADR-045 `accepted`** (onde aplicar × direções × geometria; limites conhecidos), fase, STATE, BACKLOG (2 itens do curinga).

### E3-T02 · Regiões repetidas (cabeçalho/rodapé/números de página)
- Detectar texto que se repete (ou varia só por número) em posição vertical estável entre páginas; remover do fluxo, guardar `originalPageLabel` como metadado.
- **Aceite:** `header_footer_f1` ≥ meta em N1–N3; cuidado com capítulos que começam com título no topo (não remover); teste de falso positivo.

### E3-T03 · Hifenização de fim de linha (pt/en)
- Unir `pala-` + `vra` → `palavra`; preservar hifens legítimos (`guarda-chuva`, `well-known`, ênclise `disse-lhe`) com regras e, se preciso, léxico pequeno por idioma.
- **Aceite:** `hyphen_join_acc` ≥ meta; conjunto de casos pt e en no teste; casos duvidosos marcam `flags: ["uncertain-hyphen"]` e baixam confiança.

### E3-T04 · Junção entre páginas
- Parágrafo que continua na página seguinte vira um bloco só (sinais: última linha da página sem ponto/fecha e primeira da seguinte sem recuo); inclui palavra hifenizada que cruza a página.
- **Aceite:** teste com fixtures de 2 páginas; `para_boundary_f1` não piora; `origin.pageFrom/pageTo` corretos.

### E3-T05 · Detecção de fontes com mapeamento quebrado
- Detectar texto embaralhado/privado (PUA, `\ufffd` frequente) e marcar `warnings`/baixa confiança em vez de produzir lixo silencioso.
- **Aceite:** fixture com texto corrompido gera aviso explícito.

## Checklist manual do PO
- [ ] Conferi cabeçalhos/rodapés removidos em 2 livros e nenhum conteúdo foi perdido.
- [ ] Conferi hifenização em 3 páginas de livro pt.
