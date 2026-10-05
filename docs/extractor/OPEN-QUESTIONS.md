# Perguntas em aberto (para o PO)

Regra: se uma decisão muda o rumo do produto, a IA registra aqui, marca a tarefa como `blocked` e para. O PO responde e a resposta vira ADR.

## Abertas
2. **Fontes de PDFs públicos** para o corpus N3 em pt: levantar candidatos de domínio público com PDF digital (tarefa E0-T01b). **Atualização (2026-10-04):** também falta um PDF **digital de filosofia em inglês** para o N3 — o único N3-en hoje (`n3-en-filosofia`) é scan com OCR embutido (ver CORPUS.md).
6. **Regra do campo `reliable` (pistas de estrutura, `tagHints`)** — pergunta da E1-T02 (2026-10-05), **bloqueia a E1-T02**. O texto do S3 §4.3 diz "`P`/`Sect` como nós **majoritários**", mas "majoritários" tem duas leituras possíveis e elas dão respostas diferentes no corpus (medido com a implementação atual, cobertura = páginas com árvore útil ÷ páginas com texto):

  | PDF | Cobertura | Hierarquia invertida | Papéis não-padrão | P/títulos/Document ÷ total | Estrutura de bloco ÷ total |
  |---|---|---|---|---|---|
  | `n1-en-rebus` (público, Prince XML) | 97,9% | 0 | 0 | **36,6%** | **58,8%** |
  | `n1-en-sofia` (privado) | 100% | 0 | 0 | 99,0% | 100% |
  | `n4-en-fisica` (privado) | 100% | 0 | 0 | 69,9% | 70,3% |
  | `n1-en-curinga` (privado) | 100% | **81** (`Sect` dentro de `P`) | 0 | 16,5% | 16,5% |
  | `n1-en-lostworld` (privado) | **0%** (raiz vazia) | 0 | 0 | 0% | 0% |

  A E0-T01b registrou no STATE que o `n1-en-rebus` é "tagged confiável… Document/P majoritários" — ou seja, a leitura literal (coluna 5) **contradiz** o registro. Alternativas:
  - **(a) Literal (implementada agora):** P + títulos + `Sect`/`Div`/`Document`/`Part` precisam somar ≥ 50% de **todos** os nós → `rebus` = **não confiável**, `sofia`/`fisica` = confiáveis, `curinga` = não.
  - **(b) Estrutura de bloco ≥ 50% (recomendada):** entram no numerador P, títulos, `Sect`/`Div`/`Document`/`Part`, listas (`L`/`LI`/`LBody`/`Lbl`), tabelas (`Table`/`TR`/`TH`/`TD`), `Figure`/`Caption`, `Note`/`BlockQuote`; `Span`/`Link` e nós sem papel ficam **fora do numerador** (mas continuam no denominador) → `rebus` = **confiável (58,8%)**, `curinga` continua fora (16,5% e hierarquia invertida), `lostworld` continua fora (0% de cobertura). Reproduz o registro da E0-T01b e mantém a regra "a maioria é estrutura, não ruído inline".
  - **(c) Papel mais frequente:** só passa se o nó mais comum do documento for estrutura (`P`/`Sect`/…) e não `Span` → mesmo resultado da (b) nestes 5 PDFs, com regra ainda mais curta.

  Em **todas** as opções as pistas (`paragraphs`/`figures`) continuam sendo emitidas; `reliable` só muda em quem **confia** nelas (E2 usa a árvore só como confirmação, S3 §4.1).

## Respondidas
1. **Figuras no modo de leitura normal:** mostrar um recorte de imagem da figura (renderizado do PDF) conta como exceção à regra "nunca mostrar o PDF"? **Resposta do PO (2026-10-04):** opção A — recorte de imagem só de figuras/tabelas/equações complexas, só no modo de leitura normal; na leitura dinâmica são pulados. Registrado em ADR-016 (exceção à ADR-003).
3. **Lint/format:** ESLint+Prettier ou Biome? **Resposta do PO (2026-10-04):** Biome, com ADR provisória — confirmar licença e funcionamento na E1-T00. Registrado em ADR-017. **Confirmado na E1-T00 (2026-10-05):** Biome 2.5.15 instalado, configurado (`biome.json`) e ligado ao `pnpm verify` e ao CI → ADR-017 `accepted`.
4. **Campo de arquivo local no manifest privado:** o manifest público localiza o PDF por `source_url`; o privado precisa do nome do arquivo dentro de `$CORPUS_PRIVATE_DIR`. A IA usou `file:` em `$CORPUS_PRIVATE_DIR/manifest.yaml` (13 entradas) e um `title` provisório, tirado do nome do arquivo. Alternativas: `file`, `path`, `local_path` ou reutilizar `source_url` com caminho relativo. Definir na E1-T05 (o runner mescla os dois manifests). Não bloqueia a E0-T01: só o campo precisa de nome definitivo. **Resposta do PO (2026-10-03):** usar `file:`, com o nome do arquivo relativo a `CORPUS_PRIVATE_DIR`. Registrado em ADR-014.
5. **PDFs escaneados (sem camada de texto):** o spike S1 achou `n5-pt-astrofisica.pdf` com 319 páginas e **zero** texto (só imagem). Não é defeito do PDF.js: não existe texto para ler. O que o PagePace faz com livro escaneado — (a) recusar com mensagem clara, (b) aceitar e pedir OCR depois, (c) outro? **Resposta do PO (2026-10-04):** opção B — o extrator detecta, avisa `PDF escaneado: leitura exige OCR, ainda não disponível` e não tenta extrair; o app guarda o livro na biblioteca marcado como "aguardando OCR". Registrado em ADR-018; E1-T03 ajustada.
