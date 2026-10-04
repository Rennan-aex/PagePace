# Esquema (contrato) v0: rascunho

> **Status:** rascunho. A versão `1.0.0` é fechada na tarefa E1-T01. Qualquer mudança segue as regras de versionamento abaixo. A fonte de verdade em código será `packages/schema`; este documento explica a intenção.

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
  source: { fileName: string; sha256: string; pageCount: number; producer?: string; tagged: boolean };
  outline?: RawOutlineItem[];            // bookmarks do PDF
  structTree?: unknown;                  // se PDF tagged (normalizado na ingestão)
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
```

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
`applyOverlay(book, overlay) → { book, unapplied: CorrectionOp[] }`: operações que não reancoram vão para `unapplied` (mostradas ao usuário, nunca descartadas em silêncio).

## Changelog
- `0.0.0`: placeholder do pacote.
- `0.1.0-draft`: este rascunho (E1-T01 o transforma em `1.0.0`).
- `0.1.0-draft` (doc, 2026-10-04): códigos de `extraction.warnings` documentados (`"ocr-text-layer"`) e a tabela dos dois estados de PDF escaneado — só documentação, **nenhum tipo mudou** (ADR-019).
