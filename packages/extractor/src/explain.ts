import type { BBox, Block, RawDocument } from "@pagepace/schema";
import { linePageMap } from "./bbox";
import { buildBook, paragraphMeasures } from "./book";
import { brokenFontSignal } from "./brokenfont";
import { detectCaptions } from "./captions";
import { detectDocumentColumns } from "./columns";
import { detectEndnotes } from "./endnotes";
import { detectFootnotes } from "./footnotes";
import { detectHeadings } from "./headings";
import { paragraphHyphenText } from "./hyphen";
import type { TextLine } from "./lines";
import { detectLists } from "./lists";
import { bodyMeasures, detectMarginRefs } from "./marginrefs";
import type { JoinedParagraph } from "./pagejoin";
import { joinCrossPageParagraphs } from "./pagejoin";
import { groupDocumentParagraphs } from "./paragraphs";
import { detectQuotes } from "./quotes";
import { detectReferences } from "./references";
import { stripRepeatedRegions } from "./repeated";
import { lineText } from "./spaces";
import { documentStats } from "./stats";
import { normalizeForReader } from "./unicode";

/**
 * `explain-page` (E7-T05): why every block of one page came out the way it did.
 *
 * The report is built from the **same** pipeline `buildBook` runs, in the same
 * order, over the same stripped document, so the per-layer decisions shown
 * here are the ones the builder actually took. The final `kind`, `level`,
 * `flags` and `confidence` of each paragraph are read from the real
 * `buildBook` output (matched by emission order, the way the builder skips
 * empty paragraphs), so the report can never disagree with the `Book` it
 * explains — the `explain.test.ts` suite asserts that on every synthetic and
 * minipdf document.
 *
 * Layers reported per paragraph: repeated-region removal and columns at the
 * page level; margin reference, heading, footnote/endnote, quote, caption,
 * list, reference, sidebar, hyphen join, broken font mapping, cross-page join
 * and note links at the paragraph level. Determinism: the same document and
 * page always produce the same explanation (no clock, no randomness).
 */

/** Raised when the page number is not a page of the document. */
export class ExplainPageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExplainPageError";
  }
}

/** One visual line of an explained paragraph, on one page. */
export interface ExplainedLine {
  /** 1-based page the line sits on. */
  page: number;
  text: string;
  /** Column band when the page has columns (0 = spanning strip). */
  band?: number;
  /** The line belongs to a side region (E6-T03). */
  side?: boolean;
  /** Box of the line in top-left page points (the coordinates of ADR-074). */
  bbox: BBox;
}

/** One decision of one layer, in plain words. */
export interface ExplainedLayer {
  /** Stable layer id (`margin-ref`, `heading`, ...). */
  layer: string;
  /** What the layer decided, in plain Portuguese. */
  decision: string;
}

/** A hyphen site the join met, as the report prints it. */
export interface ExplainedHyphenSite {
  left: string;
  right: string;
  decision: string;
  word: string;
}

/** One paragraph that touches the explained page, with every layer's say. */
export interface ExplainedParagraph {
  /** Ordinal of the paragraph on its first page (the builder's `b<n>`). */
  ordinalOnPage: number;
  /** 1-based pages the paragraph touches. */
  pages: number[];
  /** Final reader text (hyphens joined, normalized) — the block's text. */
  text: string;
  /** Lines joined by a plain space, before the hyphen pass. */
  rawText: string;
  /** Final kind, as the `Book` emits it. */
  kind: Block["kind"];
  /** Final level, as the `Book` emits it (headings and toc-settled levels). */
  level?: number;
  /** Final flags, as the `Book` emits them. */
  flags: string[];
  /** Final confidence, as the `Book` emits it. */
  confidence: number;
  /** Hyphen sites of the join, in order (empty when the page has none). */
  hyphenSites: ExplainedHyphenSite[];
  /** Visual lines of the paragraph, in reading order. */
  lines: ExplainedLine[];
  /** One entry per layer that had a say, in pipeline order. */
  layers: ExplainedLayer[];
}

/** Everything one page of the report holds. */
export interface PageExplanation {
  /** 1-based page that was asked for. */
  page: number;
  /** Total pages of the document. */
  pageCount: number;
  /** Text columns the detector found on this page. */
  columns: number;
  /** Body font size the document was measured at (pt). */
  bodyFontSize: number;
  /** Typical line spacing of the document (pt). */
  lineHeight: number;
  /** Lines removed as repeated furniture on this page, with their band. */
  removed: { text: string; band: string }[];
  /** Paragraphs that touch this page, in reading order. */
  paragraphs: ExplainedParagraph[];
}

function lineBBox(line: TextLine): BBox {
  return { x: line.x, y: line.top, width: line.width, height: line.bottom - line.top };
}

function pageOfLine(line: TextLine, linePages: ReadonlyMap<TextLine, number>): number {
  return (linePages.get(line) ?? 0) + 1;
}

/**
 * Explains one page (1-based) of a document: every paragraph that touches it,
 * the decision of each layer, and the final block the `Book` emits for it.
 * Throws `ExplainPageError` when the page is not part of the document.
 */
export function explainPage(document: RawDocument, page: number): PageExplanation {
  const index = page - 1;
  if (!Number.isInteger(page) || index < 0 || index >= document.pages.length) {
    throw new ExplainPageError(
      `página ${page} inexistente: o documento tem ${document.pages.length} página(s) (1..${document.pages.length})`,
    );
  }

  // The `Book` is the source of truth for kind, level, flags and confidence.
  const book = buildBook(document);

  const stripped = stripRepeatedRegions(document);
  const stats = documentStats(stripped.document);
  const pages = groupDocumentParagraphs(stripped.document);
  const linePages = linePageMap(pages);
  const paragraphs = joinCrossPageParagraphs(pages, stats.bodyFontSize);
  const marginRefs = detectMarginRefs(paragraphs, { measures: bodyMeasures(pages, paragraphs) });
  const marginRefLines = new Set(
    paragraphs
      .filter((_, paragraphIndex) => marginRefs[paragraphIndex]?.marginRef === true)
      .map((paragraph) => paragraph.lines[0])
      .filter((line): line is TextLine => line !== undefined),
  );
  const measures = paragraphMeasures(paragraphs, pages, marginRefLines);
  const headings = detectHeadings(paragraphs, {
    bodyFontSize: stats.bodyFontSize,
    lineHeight: stats.lineHeight,
    measures,
  });
  const footnotes = detectFootnotes(
    paragraphs,
    pages.map((pageLines) => pageLines.flat()),
    { bodyFontSize: stats.bodyFontSize },
  );
  const endnotes = detectEndnotes(paragraphs, { headings });
  const quotes = detectQuotes(paragraphs, {
    bodyFontSize: stats.bodyFontSize,
    lineHeight: stats.lineHeight,
    measures,
  });
  const lists = detectLists(paragraphs, { measures });
  const captions = detectCaptions(paragraphs, { bodyFontSize: stats.bodyFontSize });
  const references = detectReferences(paragraphs, { headings });
  const columns = detectDocumentColumns(stripped.document, {
    bodyFontSize: stats.bodyFontSize,
  })[index];

  const removed = stripped.regions.flatMap((region) =>
    region.occurrences
      .filter((occurrence) => occurrence.page === index)
      .map((occurrence) => ({ text: occurrence.text, band: region.band })),
  );

  const explained: ExplainedParagraph[] = [];
  const ordinals = new Map<number, number>();
  let blockIndex = -1;
  for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
    const hyphen = paragraphHyphenText(paragraph.lines);
    const text = normalizeForReader(hyphen.text);
    // The builder skips empty paragraphs before taking the ordinal; the same
    // skip here keeps explanation i matched with block i.
    if (text.trim() === "") continue;
    blockIndex += 1;
    const ordinal = ordinals.get(paragraph.pageFrom) ?? 0;
    ordinals.set(paragraph.pageFrom, ordinal + 1);
    if (index < paragraph.pageFrom || index > paragraph.pageTo) continue;
    const block = book.blocks[blockIndex];
    if (block === undefined) break;
    explained.push(
      explainParagraph({
        paragraph,
        paragraphIndex,
        ordinal,
        hyphen,
        text,
        block,
        marginRefs,
        headings,
        footnotes,
        endnotes,
        quotes,
        lists,
        captions,
        references,
        linePages,
      }),
    );
  }

  return {
    page,
    pageCount: document.pages.length,
    columns: columns?.count ?? 1,
    bodyFontSize: stats.bodyFontSize,
    lineHeight: stats.lineHeight,
    removed,
    paragraphs: explained,
  };
}

interface ExplainParagraphInput {
  paragraph: JoinedParagraph;
  paragraphIndex: number;
  ordinal: number;
  hyphen: ReturnType<typeof paragraphHyphenText>;
  text: string;
  block: Block;
  marginRefs: readonly { marginRef: boolean }[];
  headings: readonly { heading: boolean; level?: number }[];
  footnotes: readonly { footnote: boolean; uncertain: boolean }[];
  endnotes: readonly { endnote: boolean }[];
  quotes: readonly { quote: boolean; kind?: "blockquote" | "epigraph"; uncertain?: boolean }[];
  lists: readonly { list: boolean; marked: boolean; uncertain: boolean }[];
  captions: readonly { caption: boolean; uncertain: boolean }[];
  references: readonly { reference: boolean }[];
  linePages: ReadonlyMap<TextLine, number>;
}

function explainParagraph(input: ExplainParagraphInput): ExplainedParagraph {
  const {
    paragraph,
    paragraphIndex,
    ordinal,
    hyphen,
    text,
    block,
    marginRefs,
    headings,
    footnotes,
    endnotes,
    quotes,
    lists,
    captions,
    references,
    linePages,
  } = input;

  const marginRef = marginRefs[paragraphIndex]?.marginRef === true;
  const heading = headings[paragraphIndex];
  const footnote = footnotes[paragraphIndex];
  const endnote = endnotes[paragraphIndex]?.endnote === true;
  const quote = quotes[paragraphIndex];
  const list = lists[paragraphIndex];
  const caption = captions[paragraphIndex];
  const reference = references[paragraphIndex]?.reference === true;
  const side = paragraph.lines.length > 0 && paragraph.lines.every((line) => line.side === true);
  const broken = brokenFontSignal(text).broken;

  const layers: ExplainedLayer[] = [
    {
      layer: "margin-ref",
      decision: marginRef ? "sim — número de Bekker/Stephanus fora da área de texto" : "não",
    },
    {
      layer: "reference",
      decision: reference ? "sim — parágrafo de seção de bibliografia" : "não",
    },
    {
      layer: "footnote",
      decision:
        footnote?.footnote === true
          ? footnote.uncertain
            ? "sim — aceito só pela regra, sem marcador (incerto)"
            : "sim — região/marcador/regra da página"
          : endnote
            ? "sim — parágrafo de seção de notas finais"
            : "não",
    },
    {
      layer: "heading",
      decision: heading?.heading === true ? `sim — nível ${heading.level ?? "?"}` : "não",
    },
    {
      layer: "caption",
      decision:
        caption?.caption === true
          ? caption.uncertain
            ? "sim — rótulo de figura/tabela (incerto)"
            : "sim — rótulo de figura/tabela"
          : "não",
    },
    {
      layer: "list",
      decision:
        list?.list === true
          ? list.marked
            ? "sim — marcador ou número impresso"
            : list.uncertain
              ? "sim — só pelo recuo (incerto)"
              : "sim"
          : "não",
    },
    {
      layer: "quote",
      decision:
        quote?.quote === true
          ? `${quote.kind === "epigraph" ? "epígrafe" : "citação de bloco"}${
              quote.uncertain === true ? " (aceita só pelo recuo — incerta)" : ""
            }`
          : "não",
    },
    {
      layer: "sidebar",
      decision: side ? "sim — toda linha em faixa lateral, fora do fluxo" : "não",
    },
    {
      layer: "cross-page",
      decision:
        paragraph.pageFrom !== paragraph.pageTo
          ? `sim — une as páginas ${paragraph.pageFrom + 1} e ${paragraph.pageTo + 1}`
          : "não",
    },
    {
      layer: "hyphen",
      decision:
        hyphen.sites.length === 0
          ? "sem hífen de fim de linha"
          : hyphen.sites
              .map((site) => `${site.left}-|${site.right} → ${site.word} (${site.decision})`)
              .join("; "),
    },
    {
      layer: "broken-font",
      decision: broken ? "sim — muitos caracteres de substituição" : "não",
    },
    {
      layer: "note-link",
      decision: noteLinkDecision(block),
    },
  ];

  const rawText = paragraph.lines.map((line) => lineText(line.items)).join(" ");

  return {
    ordinalOnPage: ordinal,
    pages: [...new Set(paragraph.lines.map((line) => pageOfLine(line, linePages)))],
    text,
    rawText,
    kind: block.kind,
    ...(block.level === undefined ? {} : { level: block.level }),
    flags: [...block.flags],
    confidence: block.confidence,
    hyphenSites: hyphen.sites.map((site) => ({
      left: site.left,
      right: site.right,
      decision: site.decision,
      word: site.word,
    })),
    lines: paragraph.lines.map((line) => ({
      page: pageOfLine(line, linePages),
      text: lineText(line.items),
      ...(line.band === undefined ? {} : { band: line.band }),
      ...(line.side === undefined ? {} : { side: line.side }),
      bbox: lineBBox(line),
    })),
    layers,
  };
}

function noteLinkDecision(block: Block): string {
  const noteRefs = block.runs.filter((run) => run.noteRef !== undefined).length;
  const parts: string[] = [];
  if (noteRefs > 0) parts.push(`${noteRefs} chamada(s) ligada(s) a nota(s)`);
  if (block.anchor !== undefined) parts.push(`é nota ligada à chamada ${block.anchor.label}`);
  if (block.flags.includes("note-without-call")) parts.push("nota sem chamada na página");
  if (block.flags.includes("call-without-note")) parts.push("chamada sem nota correspondente");
  if (block.kind === "footnote" && parts.length === 0) parts.push("sem chamada correspondente");
  if (parts.length === 0) parts.push("sem ligação de nota");
  return parts.join("; ");
}
