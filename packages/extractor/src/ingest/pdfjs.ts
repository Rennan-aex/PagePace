import type { BBox, RawDocument, RawOutlineItem, RawPage, RawTextItem } from "@pagepace/schema";
import { parseRawDocument, SCHEMA_VERSION } from "@pagepace/schema";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { composeAccentItems, stripOrnamentItems } from "../accents";
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

    const outputPage: RawPage = {
      index: pageNumber - 1,
      width: viewport.width,
      height: viewport.height,
      rotation: viewport.rotation as 0 | 90 | 180 | 270,
      items,
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
 */
export async function ingestPdfjs(
  bytes: Uint8Array,
  options: PdfjsIngestOptions,
): Promise<RawDocument> {
  if (bytes.length === 0) throw new RangeError("ingestPdfjs: empty input");
  if (!options.fileName.trim()) throw new RangeError("ingestPdfjs: fileName is required");

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
      throw new RangeError(`ingestPdfjs: pageRange.from ${from} outside 1..${pageCount}`);
    }
    if (!Number.isInteger(to) || to < from) {
      throw new RangeError(`ingestPdfjs: pageRange.to ${to} before pageRange.from ${from}`);
    }
    const lastPage = Math.min(to, pageCount);

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
      pages.push(stripOrnamentItems(composeAccentItems(page)));
      tagPages.push(tagInput);
      if (chars) renderChars.push(chars);
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

    return parseRawDocument(document);
  } finally {
    await task.destroy().catch(() => undefined);
  }
}
