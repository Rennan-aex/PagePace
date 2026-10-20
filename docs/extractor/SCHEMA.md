# Esquema (contrato) v1.2.0

> **Status:** **`1.2.0`** — fechado em `1.0.0` pela E1-T01 (2026-10-05), ampliado pela E1-T03 (`source.ocrTextLayer`, 2026-10-05) e pela E4-T04 (`source.title`/`author`/`lang`, 2026-10-15, ver changelog). A fonte de verdade em código é `packages/schema` (tipos TypeScript + validadores de runtime com `zod` — `parseRawDocument`, `parseBook`, `parseOverlay`, `parseAnchor`); este documento explica a intenção. Qualquer mudança segue as regras de versionamento abaixo.

## Versionamento
`MAJOR.MINOR.PATCH` em `SCHEMA_VERSION`.
- **PATCH:** esclarecimento/doc, sem mudar tipos.
- **MINOR:** campo opcional novo ou tipo de bloco novo (consumidores antigos continuam funcionando).
- **MAJOR:** mudança incompatível; exige função de migração `migrate(vN → vN+1)` e teste.
Toda mudança: entrada no changelog abaixo, `DECISIONS.md`, tag `schema-vX.Y.Z`.

## 1. `RawDocument` (saída da ingestão)
Formato comum para PDF.js e para OCR.
```ts
interface RawDocument {
  schemaVersion: string;
  source: { fileName: string; sha256: string; pageCount: number; producer?: string; tagged: boolean;
            ocrTextLayer?: boolean;          // true = texto de OCR invisível (Tr 3, ADR-019)
            title?: string; author?: string; lang?: string };  // alegação do próprio PDF, sem validação (E4-T04)
  outline?: RawOutlineItem[];            // bookmarks do PDF
  tagHints?: TagHints;                   // pistas normalizadas da árvore de tags (nunca a árvore crua)
  pages: RawPage[];
  ingest: { adapter: "pdfjs" | "ocr"; adapterVersion: string };
}
interface RawPage {
  index: number;                         // 0-based
  width: number; height: number;         // em pontos PDF
  rotation: 0 | 90 | 180 | 270;
  items: RawTextItem[];
  nonText?: RawNonTextRegion[];          // imagens/vetores relevantes (bbox)
}
interface RawTextItem {
  text: string;
  x: number; y: number; width: number; height: number;   // bbox em coordenadas da página (origem no topo-esquerdo)
  fontName: string;                      // nome embutido, ex.: "Garamond-BoldItalic"
  fontSize: number;
  fontFlags?: { bold?: boolean; italic?: boolean; serif?: boolean; monospace?: boolean };
  hasEOL?: boolean;
  charWidths?: number[];                 // opcional; ajuda a inferir espaços
}
interface TagHints {
  reliable: boolean;                     // só true após a validação do S3 §4.3
  paragraphs: { page: number; bbox: BBox }[];      // nós `P` confirmados
  figures: { page: number; bbox: BBox; alt?: string }[];   // nós `Figure` (alt único)
}
```
**Árvore de tags (pedido do PO, 2026-10-04):** a árvore crua do PDF **nunca** entra no modelo. Só sobrevivem as pistas acima: confirmação de `P` e `bbox` de `Figure`, depois de descartar `Span`/`alt` repetido, `Art`/nós sem `role` e `Link`. `source.tagged` diz que o PDF *declara* `MarkInfo.Marked = true`; `tagHints.reliable` é a validação do S3 §4.3 (árvore não vazia em ≥ 90% das páginas com texto, sem hierarquia invertida, `P`/`Sect` majoritários). Validação: um input com `structTree` (ou qualquer chave extra) é **rejeitado** — objetos estritos.
**Camada de OCR (ADR-019, E1-T03):** `source.ocrTextLayer` é `true` quando a **maioria** dos caracteres do documento é desenhada com render mode invisível (`Tr 3`) — o texto de um scan que já veio reconhecido. A chave só aparece quando é `true` (documento digital não a tem). Um PDF **sem** camada de texto nenhum não chega a virar `RawDocument`: a ingestão interrompe com `ScannedPdfError` e a mensagem exata da ADR-018 (`PDF escaneado: leitura exige OCR, ainda não disponível`). Os dois estados e o que cada um vira no `Book` estão na tabela da §2.

## 2. `Book` (saída do extrator, entrada do app)
```ts
interface Book {
  schemaVersion: string;
  id: string;                            // = sha256 do PDF
  source: { fileName: string; pageCount: number };
  metadata: { title?: string; authors?: string[]; language: "pt" | "en" | "mixed" | "unknown" };
  toc: TocEntry[];                       // { title, blockId, level }
  blocks: Block[];                       // em ordem de leitura
  extraction: { tool: string; version: string; avgConfidence: number; warnings: string[] };
}

type BlockKind =
  | "heading" | "paragraph" | "blockquote" | "epigraph" | "list_item"
  | "footnote" | "reference" | "caption"
  | "figure" | "table" | "equation" | "code"
  | "margin_ref";                         // numeração marginal (Bekker/Stephanus), fora do fluxo

interface Block {
  id: string;                            // estável (ver ARCHITECTURE.md, decisão 4)
  kind: BlockKind;
  level?: number;                        // heading: 1..6
  runs: Run[];                           // texto com estilos; vazio para figure/table/equation
  origin: { pageFrom: number; pageTo: number; bbox?: BBox[]; originalPageLabel?: string };
  confidence: number;                    // 0..1
  flags: string[];                       // motivos de baixa confiança, ex.: "uncertain-paragraph-join"
  // footnote:
  anchor?: { blockId: string; runIndex: number; offset: number; label: string };
  // figure/table/equation:
  placeholder?: { description?: string; pageImageRef?: string };
}

interface Run {
  text: string;
  bold?: boolean; italic?: boolean; sup?: boolean; sub?: boolean; smallCaps?: boolean;
  noteRef?: string;                      // id do bloco footnote que esta chamada referencia
  lang?: string;                         // ex.: "grc", "la" para trechos gregos/latinos
}
```
**Códigos de `extraction.warnings` (rascunho, ADR-019):**
- `"ocr-text-layer"` — o texto veio de uma **camada de OCR embutida em scan** (`Tr 3`, invisível). O `Book` é gerado normalmente, mas com **confiança reduzida**, runs **sem `bold`/`italic`** e o app exibindo "texto de OCR embutido: leitura com aviso" (o texto pode ter erros).

**Dois estados de um PDF escaneado (ADR-018 + ADR-019):**

| Situação | No modelo | No app |
|---|---|---|
| Sem camada de texto (scan puro) | **nenhum `Book`** — a ingestão interrompe com a mensagem da E1-T03 | "sem texto: aguardando OCR" (fica na biblioteca, não abre) |
| Texto de OCR embutido (`Tr 3`) | `Book` com `warnings` contendo `"ocr-text-layer"`, confiança baixa, sem estilo | "texto de OCR embutido: leitura com aviso" (abre e avisa) |
| Texto digital normal | `Book` sem esse warning | leitura normal |

**Texto de um bloco** = concatenação de `runs[].text`. Offsets de âncora sempre referem a esse texto.
**Hifenização:** o texto do bloco já vem com palavras unidas; hifens genuínos de palavras compostas são preservados.
**`metadata` (E4-T04):** `language` sai da detecção léxica (stopwords pt/en sobre o texto dos blocos) somada à dica `source.lang` do PDF; `title`/`authors` vêm dos campos `Title`/`Author` do PDF depois da saneação (vazio e nome de arquivo descartados). PDF sem sinal → `language: "unknown"`, campos de título/autores ausentes.
**Palavras:** não estão no modelo; ver `@pagepace/segmenter`.

## 3. `Anchor` (para o app ancorar posição, marcações e anotações)
```ts
interface Anchor {
  blockId: string;
  start: number; end: number;            // offsets no texto do bloco
  quote: string; prefix: string; suffix: string;   // reancoragem se a extração mudar
}
```
(O armazenamento de anotações é do app; o tipo vive aqui para o contrato ser único.)

## 4. `Overlay` (correções do usuário)
```ts
interface Overlay {
  schemaVersion: string;
  bookId: string;
  ops: CorrectionOp[];                   // aplicadas em ordem
}
type CorrectionOp = { id: string; createdAt: string; target: Anchor } & (
  | { op: "merge_with_next" }
  | { op: "split_at"; offset: number }
  | { op: "set_kind"; kind: BlockKind; level?: number }
  | { op: "delete_block" }
  | { op: "edit_text"; replacement: string }
  | { op: "set_style"; start: number; end: number; style: Partial<Pick<Run, "bold" | "italic" | "sup" | "sub">> }
);
```
`applyOverlay(book, overlay) → { book, unapplied: CorrectionOp[] }`: operações que não reancoram vão para `unapplied` (mostradas ao usuário, nunca descartadas em silêncio). **Implementado na E7-T02** (`packages/schema/src/apply.ts`, ADR-072): reancoragem por id + citação nos offsets gravados e, se o id sumir ou o texto mudar, busca **única** da citação com prefixo/suffix em todo o livro (zero ou vários achados = `unapplied`); offsets internos das operações deslocam pelo delta da reancoragem; `split_at` cria id `<id>#<n>` determinístico; `merge_with_next` mantém o id/tipo do primeiro bloco e retargeta toc/noteRef/âncora; `edit_text` substiti a faixa com texto simples e marca o bloco como confiança 1 sem flags (verdade do usuário); `delete_block` nunca remove o último bloco e limpa ponteiros órfãos; `set_style` liga/desliga flags por faixa; overlay de outro `bookId` inteiro vai para `unapplied`.

## Changelog
- `0.0.0`: placeholder do pacote.
- `0.1.0-draft`: rascunho inicial (E1-T01 o transforma em `1.0.0`).
- `0.1.0-draft` (doc, 2026-10-04): códigos de `extraction.warnings` documentados (`"ocr-text-layer"`) e a tabela dos dois estados de PDF escaneado — só documentação, **nenhum tipo mudou** (ADR-019).
- `1.0.0` (2026-10-05, E1-T01): contrato fechado em código. `structTree?: unknown` → **`tagHints?: TagHints`** (a árvore crua não é persistida — ADR-025). Validação de runtime com `zod` (ADR-024): objetos estritos (chaves desconhecidas rejeitadas), `confidence`/`avgConfidence` em 0..1, `blocks` e `runs` não vazios, `heading` exige `level`, `origin.pageTo >= pageFrom`, `Anchor.end >= start`, `CorrectionOp` como união discriminada por `op`, `createdAt` ISO-8601 com fuso. Fixtures válidas e inválidas em `packages/schema/src/fixtures.ts`.
- `1.1.0` (2026-10-05, E1-T03): **MINOR** — campo opcional `source.ocrTextLayer?: boolean` no `RawDocument`, marcado quando a maioria dos caracteres vem de uma camada de OCR invisível (`Tr 3`, ADR-019/ADR-029); é ele que o construtor do `Book` transforma em `extraction.warnings: ["ocr-text-layer"]`, confiança reduzida e runs sem negrito/itálico. Sem migração (nada foi removido); como `schemaVersion` é literal, JSON gravado como `1.0.0` deixa de validar — hoje não existe nenhum artefato gravado. Detector A (ADR-018) não acrescenta campo: PDF sem camada de texto não gera `RawDocument` (`ScannedPdfError`).
- `1.2.0` (2026-10-15, E4-T04): **MINOR** — três campos opcionais em `RawDocument.source`: `title?`, `author?` e `lang?`, a cópia cruza do que o próprio PDF declara (`Info.Title`, `Info.Author` e o `/Lang` do catálogo, lidos pelo PDF.js na ingestão). São alegação do produtor, não verdade: o extrator saneia antes de virar `Book.metadata` (ADR-057). Sem migração; os campos são ausentes quando o PDF não os declara (mesmo padrão do `producer`).
