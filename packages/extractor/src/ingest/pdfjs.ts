import type { BBox, RawDocument, RawOutlineItem, RawPage, RawTextItem } from "@pagepace/schema";
import { parseWith, rawDocumentSchema, rawPageSchema, SCHEMA_VERSION } from "@pagepace/schema";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { composeAccentItems, stripOrnamentItems } from "../accents";
import { MemoryGovernor } from "./memory";
import { collectNonTextRegions } from "./non-text";
import { sha256Hex } from "./sha256";
import type { PageTagInput } from "./tag-hints";
import { buildTagHints } from "./tag-hints";
import type { RenderModeChars } from "./text-layer";
import { countRenderModeChars, isOcrTextLayer, ScannedPdfError } from "./text-layer";

/**
 * PDF.js ingestion: bytes in, validated `RawDocument` out.
 *
 * The adapter never touches the file system (REQ-EXT-17): callers read the
 * bytes (the CLI does it in E1-T04) and hand them over as a `Uint8Array`.
 * Nothing here reads the clock or any other ambient state, so the same bytes
 * always produce the same JSON (REQ-EXT-16).
 */

/** Exact `pdfjs-dist` version this adapter was written against (ADR-015). */
export const PDFJS_DIST_VERSION = "6.4.299";

/**
 * Default pages read between pdf.js cache sweeps (E8-T03 / ADR-087, amended
 * by ADR-090): `0` — no document-level sweep by default. Measured on the
 * stress corpus, the sweep *raised* the peak everywhere it was tried
 * (`n1-en-lostworld` 446 MB vs 313 MB without, `n1-pt-sofia` ~268 vs ~262,
 * and it was slower on every document): `pdf.cleanup()` only forces the
 * re-decoding of fonts and images, while the per-page `page.cleanup()` inside
 * {@link readPage} already releases each page. Callers may still pass
 * {@link PdfjsIngestOptions.cleanupEveryPages} with a positive cadence.
 */
export const DEFAULT_CLEANUP_EVERY_PAGES = 0;

/** Name reported when pdf.js cannot resolve a font to a real PostScript name. */
const UNKNOWN_FONT = "unknown";

export interface PdfjsAssets {
  /** Plain path in Node, URL in the browser — never a `file://` URL (S1 §5). */
  standardFontDataUrl?: string;
  cMapUrl?: string;
  wasmUrl?: string;
  cMapPacked?: boolean;
}

export interface PdfjsIngestOptions {
  /** Recorded as `source.fileName`; the adapter does not open files. */
  fileName: string;
  /** 1-based inclusive page range. Defaults to the whole document. */
  pageRange?: { from: number; to: number };
  /** Where pdf.js finds fonts, CMaps and WASM. Omit to run without them. */
  assets?: PdfjsAssets;
  /**
   * Pages read between pdf.js cache sweeps (E8-T03 / ADR-087). Must be an
   * integer >= 0; 0 disables the sweep. Defaults to
   * {@link DEFAULT_CLEANUP_EVERY_PAGES} — and the default is `0` because the
   * sweep was measured to *raise* the peak of every stress document
   * (ADR-090).
   */
  cleanupEveryPages?: number;
  /**
   * Budget of resident memory in bytes (E8-T03, fatia 3). Sampled at every
   * page boundary: the first sample over the budget continues the read (it
   * may be delayed garbage collection), a second consecutive overage throws
   * `MemoryLimitError`. Requires {@link memoryUsage}; without a probe there
   * is nothing to sample.
   */
  memoryLimitBytes?: number;
  /**
   * Platform probe behind the budget (E8-T03): Node passes
   * `process.memoryUsage`, the browser an adapter over `performance.memory`.
   * The core never imports a platform API (rule 6) — with no probe the
   * budget is not enforced.
   */
  memoryUsage?: () => { rss: number; heapUsed: number; external: number };
}

interface PdfjsTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
  hasEOL?: boolean;
}

interface PdfjsMarkedItem {
  type?: string;
  id?: string | null;
  tag?: string;
}

interface PdfjsFontStyle {
  fontFamily?: string;
}

interface PdfjsFont {
  name?: unknown;
  data?: Uint8Array;
  clearData?: () => void;
}

type PdfjsOutlineNode = {
  title?: string;
  dest?: unknown;
  url?: string | null;
  items?: PdfjsOutlineNode[];
};

const SUBSET_PREFIX = /^[A-Za-z]{6}\+/;

/** `ABCDEF+Garamond-Bold` → `Garamond-Bold` (S1 §5, trap 6). */
export function stripSubsetPrefix(fontName: string): string {
  return fontName.replace(SUBSET_PREFIX, "");
}

/** `getMarkInfo()` returns a `Map` at runtime although its types say otherwise (S3). */
function readMarked(markInfo: unknown): boolean {
  if (markInfo instanceof Map) return markInfo.get("Marked") === true;
  if (markInfo && typeof markInfo === "object")
    return (markInfo as { Marked?: unknown }).Marked === true;
  return false;
}

function glyphBox(item: PdfjsTextItem, view: readonly [number, number, number, number]): BBox {
  const transform = item.transform;
  const height = Number.isFinite(item.height) && item.height >= 0 ? item.height : 0;
  const width = Number.isFinite(item.width) && item.width >= 0 ? item.width : 0;
  const rawX = Number.isFinite(transform[4] ?? Number.NaN) ? (transform[4] as number) : 0;
  const baselineY = Number.isFinite(transform[5] ?? Number.NaN) ? (transform[5] as number) : 0;
  // `getTextContent()` reports positions in PDF user space: origin at the
  // bottom-left, y growing up (measured against `n1-en-rebus` p1: baseline
  // 689 renders at y≈86 of a 792pt page). The schema wants page coordinates
  // with the origin at the top-left corner, so the baseline is mirrored
  // around `view[3]` first and the box then grows `height` points upward.
  const baselineFromTop = view[3] - baselineY;
  return { x: rawX - view[0], y: baselineFromTop - height, width, height };
}

function fontSizeOf(item: PdfjsTextItem): number {
  const transform = item.transform;
  return (
    Math.hypot(transform[0] ?? 0, transform[1] ?? 0) ||
    Math.hypot(transform[2] ?? 0, transform[3] ?? 0) ||
    1
  );
}

function resolveFontName(
  page: PDFPageProxy,
  internalName: string,
  styles: Record<string, PdfjsFontStyle>,
): string {
  try {
    const font = page.commonObjs.get(internalName) as PdfjsFont | undefined;
    const name = font?.name;
    if (typeof name === "string" && name.trim()) return stripSubsetPrefix(name.trim());
  } catch {
    // The font object only exists after `getOperatorList()` resolved it.
  }
  const family = styles[internalName]?.fontFamily;
  if (typeof family === "string" && family.trim()) return family.trim();
  return UNKNOWN_FONT;
}

/**
 * Releases the font bytes pdf.js keeps on the main thread while
 * `fontExtraProperties` is on (E8-T03 / BACKLOG 2026-10-04; ADR-086). The
 * name and metrics already read stay available, but `data` is a getter over
 * a binary buffer — `delete` does nothing — so `clearData()` (the same call
 * pdf.js makes when the flag is off) is what actually frees the bytes.
 * Unresolved ids and fonts without the method are skipped.
 */
export function discardFontData(page: PDFPageProxy, internalNames: Iterable<string>): void {
  for (const internalName of internalNames) {
    let font: PdfjsFont | undefined;
    try {
      font = page.commonObjs.get(internalName) as PdfjsFont | undefined;
    } catch {
      continue;
    }
    font?.clearData?.();
  }
}

/**
 * Sweeps the caches pdf.js keeps per document (E8-T03 fatia 2 / ADR-087):
 * worker-side translated fonts, decoded cross-page images and CMaps, plus the
 * main-thread `commonObjs` and font loader. Fonts translate again on the next
 * page that uses them, so the sweep is a memory-versus-CPU trade — the caller
 * chooses the cadence. The extracted text is unaffected (measured in
 * `pdfjs-ingest.test.ts` against the public corpus).
 */
export async function releasePdfjsCaches(pdf: PDFDocumentProxy): Promise<void> {
  await pdf.cleanup();
}

function fontFlagsOf(
  styles: Record<string, PdfjsFontStyle>,
  internalName: string,
): RawTextItem["fontFlags"] | undefined {
  const family = styles[internalName]?.fontFamily;
  // Only positive assertions: pdf.js guesses the family from the name and
  // never knows bold/italic for embedded fonts (S2/E4 decides from the name).
  if (family === "serif") return { serif: true };
  if (family === "monospace") return { monospace: true };
  return undefined;
}

/**
 * Maps the marked-content markers of `getTextContent({includeMarkedContent})`
 * to boxes, keyed by the struct-tree content id. Every id in the marker stack
 * receives the box (a `Span` inside a `P` contributes to both).
 */
function collectMcidBoxes(
  items: readonly unknown[],
  view: readonly [number, number, number, number],
): Map<string, BBox> {
  const boxes = new Map<string, BBox>();
  const stack: (string | null)[] = [];
  for (const raw of items) {
    const item = raw as PdfjsMarkedItem & Partial<PdfjsTextItem>;
    const type = item.type;
    if (type === "beginMarkedContentProps" || type === "beginMarkedContent") {
      stack.push(typeof item.id === "string" && item.id ? item.id : null);
      continue;
    }
    if (type === "endMarkedContent") {
      stack.pop();
      continue;
    }
    if (typeof item.str !== "string" || stack.length === 0) continue;
    const box = glyphBox(item as PdfjsTextItem, view);
    for (const id of stack) {
      if (!id) continue;
      const current = boxes.get(id);
      if (!current) {
        boxes.set(id, { ...box });
        continue;
      }
      const x1 = Math.min(current.x, box.x);
      const y1 = Math.min(current.y, box.y);
      const x2 = Math.max(current.x + current.width, box.x + box.width);
      const y2 = Math.max(current.y + current.height, box.y + box.height);
      boxes.set(id, { x: x1, y: y1, width: x2 - x1, height: y2 - y1 });
    }
  }
  return boxes;
}

async function resolvePageIndex(
  pdf: PDFDocumentProxy,
  dest: unknown,
  depth = 0,
): Promise<number | null> {
  if (depth > 5) return null;
  try {
    if (typeof dest === "string") {
      const resolved = await pdf.getDestination(dest);
      return Array.isArray(resolved) ? resolvePageIndex(pdf, resolved, depth + 1) : null;
    }
    if (!Array.isArray(dest)) return null;
    const target = dest[0];
    if (typeof target === "string") return resolvePageIndex(pdf, target, depth + 1);
    if (target && typeof target === "object" && "num" in target) {
      const index = await pdf.getPageIndex(target as { num: number; gen: number });
      return Number.isInteger(index) && index >= 0 && index < pdf.numPages ? index : null;
    }
    return null;
  } catch {
    return null;
  }
}

async function toOutlineItem(
  pdf: PDFDocumentProxy,
  node: PdfjsOutlineNode,
): Promise<RawOutlineItem> {
  const item: RawOutlineItem = {
    title: typeof node.title === "string" && node.title.trim() ? node.title : " ",
    pageIndex: null,
  };
  if (node.url == null && node.dest != null)
    item.pageIndex = await resolvePageIndex(pdf, node.dest);
  if (Array.isArray(node.items) && node.items.length > 0) {
    item.children = await Promise.all(node.items.map((child) => toOutlineItem(pdf, child)));
  }
  return item;
}

async function buildOutline(pdf: PDFDocumentProxy): Promise<RawOutlineItem[] | undefined> {
  let nodes: PdfjsOutlineNode[] | null = null;
  try {
    nodes = await pdf.getOutline();
  } catch {
    return undefined;
  }
  if (!Array.isArray(nodes) || nodes.length === 0) return undefined;
  return Promise.all(nodes.map((node) => toOutlineItem(pdf, node)));
}

function readProducer(metadata: { info?: unknown } | null): string | undefined {
  return readInfoString(metadata, "Producer");
}

/** One trimmed string from the PDF info dictionary, or undefined when absent/blank. */
function readInfoString(
  metadata: { info?: unknown } | null,
  key: "Producer" | "Title" | "Author" | "Language",
): string | undefined {
  const info = metadata?.info as Record<string, unknown> | undefined;
  const value = info?.[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

async function readPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
): Promise<{ page: RawPage; tagInput: PageTagInput; chars: RenderModeChars | null }> {
  const page = await pdf.getPage(pageNumber);
  try {
    const viewport = page.getViewport({ scale: 1 });
    const view: [number, number, number, number] = [
      viewport.viewBox[0] ?? 0,
      viewport.viewBox[1] ?? 0,
      viewport.viewBox[2] ?? 0,
      viewport.viewBox[3] ?? 0,
    ];
    const textContent = await page.getTextContent({ includeMarkedContent: true });

    // The real font name only reaches the main thread after the operator list
    // resolves the fonts (S1 §5); a broken page must not lose its text.
    // The same list is what detector B reads (`Tr 3` characters, ADR-019).
    const operatorList = await page.getOperatorList().catch(() => null);
    const structTree = await page.getStructTree().catch(() => null);

    const styles = (textContent.styles ?? {}) as Record<string, PdfjsFontStyle>;
    const items: RawTextItem[] = [];
    for (const raw of textContent.items) {
      const item = raw as Partial<PdfjsTextItem> & PdfjsMarkedItem;
      if (typeof item.str !== "string") continue;
      const textItem = item as PdfjsTextItem;
      const box = glyphBox(textItem, view);
      const flags = fontFlagsOf(styles, textItem.fontName);
      const rawItem: RawTextItem = {
        text: textItem.str,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        fontName: resolveFontName(page, textItem.fontName, styles),
        fontSize: fontSizeOf(textItem),
      };
      if (flags) rawItem.fontFlags = flags;
      if (textItem.hasEOL === true) rawItem.hasEOL = true;
      items.push(rawItem);
    }

    // E8-T03: every font name on the page is read; release the bytes
    // `fontExtraProperties` retained (S1 measured 308 MB on n4).
    discardFontData(page, Object.keys(styles));

    // E10-T01: the same operator list the font/OCR reads already carries
    // every image and painted path — the regions land in `page.nonText`
    // only when there is at least one, so a page without art keeps its
    // exact previous JSON.
    const nonText = operatorList ? collectNonTextRegions(operatorList, view) : [];

    const outputPage: RawPage = {
      index: pageNumber - 1,
      width: viewport.width,
      height: viewport.height,
      rotation: viewport.rotation as 0 | 90 | 180 | 270,
      items,
      ...(nonText.length > 0 ? { nonText } : {}),
    };

    const tagInput: PageTagInput = {
      index: pageNumber - 1,
      view,
      tree: structTree ?? null,
      hasText: items.length > 0,
      mcidBoxes: collectMcidBoxes(textContent.items, view),
    };
    const chars = operatorList ? countRenderModeChars(operatorList) : null;
    return { page: outputPage, tagInput, chars };
  } finally {
    page.cleanup();
  }
}

/**
 * Detector A (ADR-018): does the document have any text at all?
 *
 * Runs before the real read and stops at the first page with text, so a
 * digital book pays for a single extra `getTextContent` while a scan is
 * recognised without ever building (or faking) a `RawDocument`.
 */
async function documentHasText(pdf: PDFDocumentProxy): Promise<boolean> {
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    try {
      const content = await page.getTextContent();
      const hasText = content.items.some((item) => {
        const text = (item as Partial<PdfjsTextItem>).str;
        return typeof text === "string" && text.trim() !== "";
      });
      if (hasText) return true;
    } finally {
      page.cleanup();
    }
  }
  return false;
}

/**
 * Cheap pre-flight probe for the scanned flow (E9-T04 / ADR-018): does the
 * PDF have a text layer at all?
 *
 * `true` means "no usable text on any page" — the file is a scan (or a
 * degenerate 0-page document) and the caller should offer OCR instead of
 * running {@link ingestPdfjs} (which would throw `ScannedPdfError` anyway).
 * `false` means at least one page carries text, so the normal pdf.js path
 * is safe. The probe stops at the first page with text, exactly like the
 * detector inside `ingestPages`, so a digital book pays for one extra
 * `getTextContent` and a scan is recognised without building a document.
 *
 * Throws `RangeError` on empty input. The same bytes always give the same
 * answer (rule 7): nothing here reads the clock or any ambient state.
 */
export async function isScannedPdf(
  bytes: Uint8Array,
  options: { assets?: PdfjsAssets } = {},
): Promise<boolean> {
  if (bytes.length === 0) throw new RangeError("isScannedPdf: empty input");

  const task = getDocument({
    data: bytes.slice(),
    fontExtraProperties: true,
    verbosity: 0,
    ...(options.assets?.standardFontDataUrl
      ? { standardFontDataUrl: options.assets.standardFontDataUrl }
      : {}),
    ...(options.assets?.cMapUrl ? { cMapUrl: options.assets.cMapUrl } : {}),
    ...(options.assets?.wasmUrl ? { wasmUrl: options.assets.wasmUrl } : {}),
    ...(options.assets?.cMapPacked !== undefined ? { cMapPacked: options.assets.cMapPacked } : {}),
  });

  try {
    const pdf = await task.promise;
    return !(await documentHasText(pdf));
  } finally {
    await task.destroy().catch(() => undefined);
  }
}

/**
 * Reads a PDF from memory as a stream of pages (E8-T01, fatia 2): every page
 * is yielded as soon as it is read — the `page` layer of the `extractStream`
 * protocol (ADR-088, "o app começa a ler enquanto o resto processa") — and the
 * assembled, validated `RawDocument` is the generator's return value, so the
 * batch path and the streaming path share one single implementation.
 *
 * The returned document passes the `@pagepace/schema` validator (throws
 * `SchemaValidationError` otherwise). Every page goes through
 * `composeAccentItems` (E3-T01b) and then `stripOrnamentItems` (backlog 3A)
 * before it is yielded: the LaTeX spacing-accent items are recomposed and the
 * symbol-font ornaments are dropped here so the CLI, the evaluation and the
 * tests all see the same text. The yielded page **is** the page the returned
 * document holds (E8-T03, fatia 3: each page is validated as it leaves the
 * read window — `rawPageSchema` — and the envelope is validated without its
 * pages, so a 500-page book is never rebuilt in one piece at the end; the
 * validator used to double the document for a moment, which pushed the peak
 * of a long book past its memory budget).
 *
 * Throws `ScannedPdfError` when the file has no text layer (ADR-018), and
 * flags `source.ocrTextLayer` when most characters come from an invisible
 * OCR layer (ADR-019). A consumer that stops iterating early still gets the
 * pdf.js task torn down (the `finally` below runs on `.return()`).
 *
 * Memory budget (E8-T03, fatia 3): with `memoryLimitBytes` and `memoryUsage`
 * the read samples the resident set at every page boundary — the first
 * sample over the budget continues the read (it may be delayed garbage
 * collection), a second consecutive overage throws `MemoryLimitError` out
 * of the generator. Without a probe nothing is sampled.
 */
export async function* ingestPages(
  bytes: Uint8Array,
  options: PdfjsIngestOptions,
): AsyncGenerator<RawPage, RawDocument> {
  if (bytes.length === 0) throw new RangeError("ingestPages: empty input");
  if (!options.fileName.trim()) throw new RangeError("ingestPages: fileName is required");

  const digest = sha256Hex(bytes);
  // pdf.js may transfer the buffer to its worker: give it a copy so callers
  // can keep hashing/reading their own bytes.
  const task = getDocument({
    data: bytes.slice(),
    // pdf.js v6 no longer evaluates JavaScript inside a PDF, so the old
    // `isEvalSupported` parameter is gone; `fontExtraProperties` is what makes
    // the real font name available (S1 §5, ADR-015).
    fontExtraProperties: true,
    verbosity: 0,
    ...(options.assets?.standardFontDataUrl
      ? { standardFontDataUrl: options.assets.standardFontDataUrl }
      : {}),
    ...(options.assets?.cMapUrl ? { cMapUrl: options.assets.cMapUrl } : {}),
    ...(options.assets?.wasmUrl ? { wasmUrl: options.assets.wasmUrl } : {}),
    ...(options.assets?.cMapPacked !== undefined ? { cMapPacked: options.assets.cMapPacked } : {}),
  });

  try {
    const pdf = await task.promise;
    const pageCount = pdf.numPages;

    const from = options.pageRange?.from ?? 1;
    const to = options.pageRange?.to ?? pageCount;
    if (!Number.isInteger(from) || from < 1 || from > pageCount) {
      throw new RangeError(`ingestPages: pageRange.from ${from} outside 1..${pageCount}`);
    }
    if (!Number.isInteger(to) || to < from) {
      throw new RangeError(`ingestPages: pageRange.to ${to} before pageRange.from ${from}`);
    }
    const lastPage = Math.min(to, pageCount);

    const cleanupEvery = options.cleanupEveryPages ?? DEFAULT_CLEANUP_EVERY_PAGES;
    if (!Number.isInteger(cleanupEvery) || cleanupEvery < 0) {
      throw new RangeError(
        `ingestPages: cleanupEveryPages ${cleanupEvery} must be an integer >= 0`,
      );
    }

    // E8-T03 (fatia 3): the memory budget is only as real as its probe — a
    // limit without one would be a silent no-op, so it is a usage error.
    if (options.memoryLimitBytes !== undefined && options.memoryUsage === undefined) {
      throw new RangeError("ingestPages: memoryLimitBytes requires memoryUsage");
    }
    if (
      options.memoryLimitBytes !== undefined &&
      (!Number.isInteger(options.memoryLimitBytes) || options.memoryLimitBytes <= 0)
    ) {
      throw new RangeError(
        `ingestPages: memoryLimitBytes ${options.memoryLimitBytes} must be an integer > 0`,
      );
    }
    const governor =
      options.memoryLimitBytes !== undefined && options.memoryUsage !== undefined
        ? new MemoryGovernor(options.memoryLimitBytes, options.memoryUsage)
        : null;

    // Detector A (ADR-018): a document without a text layer is a scan, not an
    // empty book — refuse here, before anything else is assembled.
    if (!(await documentHasText(pdf))) throw new ScannedPdfError();

    const markInfo: unknown = await pdf.getMarkInfo().catch(() => null);
    const tagged = readMarked(markInfo);
    const metadata = await pdf.getMetadata().catch(() => null);
    const outline = await buildOutline(pdf);

    const pages: RawPage[] = [];
    const tagPages: PageTagInput[] = [];
    const renderChars: RenderModeChars[] = [];
    for (let pageNumber = from; pageNumber <= lastPage; pageNumber++) {
      const { page, tagInput, chars } = await readPage(pdf, pageNumber);
      // E8-T03 (fatia 3): the page is validated as it leaves the read window
      // — the window holds one page of validation debt, never the whole book.
      const ingested = parseWith(
        rawPageSchema,
        stripOrnamentItems(composeAccentItems(page)),
        "RawPage",
      );
      pages.push(ingested);
      tagPages.push(tagInput);
      if (chars) renderChars.push(chars);
      // E8-T01 / ADR-088: the page leaves the adapter the moment it is read,
      // before the pages that follow it and before the document is assembled.
      yield ingested;
      // E8-T03: sweep the pdf.js caches so a long book does not keep every
      // translated font and image alive until task.destroy() (ADR-087; the
      // default cadence is off, ADR-090).
      if (cleanupEvery > 0 && (pageNumber - from + 1) % cleanupEvery === 0) {
        await releasePdfjsCaches(pdf);
      }
      // E8-T03 (fatia 3): the budget samples at the boundary — after the page
      // was yielded and `page.cleanup()` ran. The first overage continues (it
      // may be delayed garbage collection); a second consecutive overage
      // throws `MemoryLimitError` out of the generator (ADR-090: there is no
      // mid-flight degradation — the only candidate lever was measured to
      // raise the peak on every stress document).
      governor?.samplePageBoundary(pageNumber - from + 1);
    }

    const tagHints = buildTagHints({ marked: tagged, pages: tagPages });

    const producer = readProducer(metadata);
    // The producer's claim about the document (E4-T04): kept raw and optional,
    // `buildBook` sanitizes it into `Book.metadata` (ADR-057).
    const pdfTitle = readInfoString(metadata, "Title");
    const pdfAuthor = readInfoString(metadata, "Author");
    const pdfLang = readInfoString(metadata, "Language");

    // Detector B (ADR-019): most characters invisible -> the text layer of a
    // scan. Measured on the pages actually read (a `pageRange` is a sample).
    const ocrTextLayer = isOcrTextLayer(renderChars);

    const document: RawDocument = {
      schemaVersion: SCHEMA_VERSION,
      source: {
        fileName: options.fileName,
        sha256: digest,
        pageCount,
        ...(producer ? { producer } : {}),
        ...(pdfTitle ? { title: pdfTitle } : {}),
        ...(pdfAuthor ? { author: pdfAuthor } : {}),
        ...(pdfLang ? { lang: pdfLang } : {}),
        tagged,
        ...(ocrTextLayer ? { ocrTextLayer: true } : {}),
      },
      ...(outline ? { outline } : {}),
      ...(tagHints ? { tagHints } : {}),
      pages,
      ingest: { adapter: "pdfjs", adapterVersion: PDFJS_DIST_VERSION },
    };

    // E8-T03 (fatia 3): the envelope is validated without its pages — every
    // page was already validated as it left the read window — so the whole
    // book is never rebuilt in one piece (the rebuild used to hold two copies
    // of every item, the spike that pushed a long book past its budget).
    const envelope = parseWith(rawDocumentSchema, { ...document, pages: [] }, "RawDocument");
    envelope.pages = pages;
    return envelope;
  } finally {
    await task.destroy().catch(() => undefined);
  }
}

/**
 * Reads a PDF from memory and returns a `RawDocument` that passes the
 * `@pagepace/schema` validator (throws `SchemaValidationError` otherwise).
 * Every page first goes through `composeAccentItems` (E3-T01b) and then
 * `stripOrnamentItems` (backlog 3A): the LaTeX spacing-accent items are
 * recomposed and the symbol-font ornaments are dropped here so the CLI, the
 * evaluation and the tests all see the same text.
 *
 * Throws `ScannedPdfError` when the file has no text layer (ADR-018), and
 * flags `source.ocrTextLayer` when most characters come from an invisible
 * OCR layer (ADR-019).
 *
 * Since E8-T01 (fatia 2) this is the batch facade over {@link ingestPages}:
 * it drains the stream of pages and returns the document the generator
 * assembled — byte-identical to what the batch loop always produced.
 */
export async function ingestPdfjs(
  bytes: Uint8Array,
  options: PdfjsIngestOptions,
): Promise<RawDocument> {
  const pages = ingestPages(bytes, options);
  for (;;) {
    const step = await pages.next();
    if (step.done === true) return step.value;
  }
}
