import type { DocumentStats, PageExplanation } from "@pagepace/extractor";
import type { Book } from "@pagepace/schema";

/**
 * Report formatting for the CLI (E7-T05): the `inspect` report (text,
 * Markdown and HTML, page image next to the extracted blocks with their
 * confidence flags) and the `explain-page` report (every layer's decision
 * for one page). Pure functions over the model the commands build, so the
 * tests exercise the exact strings the console or the files receive, and
 * nothing here touches the filesystem.
 */

/** One block of the inspect model, in reading order. */
export interface ReportBlock {
  id: string;
  kind: string;
  level?: number;
  confidence: number;
  flags: string[];
  text: string;
  /** 1-based pages the block touches. */
  pages: number[];
}

/** One page of the inspect model. */
export interface ReportPage {
  page: number;
  blocks: ReportBlock[];
}

/** Everything the inspect report renders. */
export interface InspectModel {
  file: string;
  pageCount: number;
  pages: ReportPage[];
  stats: {
    pagesMeasured: number;
    itemsMeasured: number;
    bodyFontSize: number;
    lineHeight: number;
    margins: { top: number; right: number; bottom: number; left: number };
    columnWidth: number;
  };
}

function blockText(block: Book["blocks"][number]): string {
  return block.runs.map((run) => run.text).join("");
}

/** Blocks of `book` that touch each 1-based page of `pages`, in reading order. */
export function inspectModel(
  file: string,
  document: { source: { pageCount: number } },
  book: Book,
  stats: DocumentStats,
  pages: readonly number[],
): InspectModel {
  return {
    file,
    pageCount: document.source.pageCount,
    pages: pages.map((page) => ({
      page,
      blocks: book.blocks
        .filter((block) => block.origin.pageFrom < page && block.origin.pageTo >= page - 1)
        .map((block) => ({
          id: block.id,
          kind: block.kind,
          ...(block.level === undefined ? {} : { level: block.level }),
          confidence: block.confidence,
          flags: [...block.flags],
          text: blockText(block),
          pages: [
            ...new Set(
              Array.from(
                { length: block.origin.pageTo - block.origin.pageFrom + 1 },
                (_, offset) => block.origin.pageFrom + offset + 1,
              ),
            ),
          ],
        })),
    })),
    stats: {
      pagesMeasured: stats.pagesMeasured,
      itemsMeasured: stats.itemsMeasured,
      bodyFontSize: stats.bodyFontSize,
      lineHeight: stats.lineHeight,
      margins: { ...stats.margins },
      columnWidth: stats.columnWidth,
    },
  };
}

function pt(value: number): string {
  return `${value.toFixed(2)} pt`;
}

function flagsLabel(flags: readonly string[]): string {
  return flags.length === 0 ? "nenhuma" : flags.join(", ");
}

/** The document summary both reports open with. */
export function formatSummary(model: InspectModel): string {
  const { margins } = model.stats;
  return [
    `Arquivo: ${model.file}`,
    `Páginas medidas: ${model.stats.pagesMeasured} de ${model.pageCount}`,
    `Itens de texto: ${model.stats.itemsMeasured}`,
    `Páginas no relatório: ${model.pages.map((page) => page.page).join(", ")}`,
    `Corpo (moda ponderada): ${pt(model.stats.bodyFontSize)}`,
    `Entrelinha típica: ${pt(model.stats.lineHeight)}`,
    `Margens: topo ${pt(margins.top)} · direita ${pt(margins.right)} · base ${pt(margins.bottom)} · esquerda ${pt(margins.left)}`,
    `Largura de coluna: ${pt(model.stats.columnWidth)}`,
    "",
  ].join("\n");
}

function blockHeading(block: ReportBlock): string {
  const level = block.level === undefined ? "" : ` nível ${block.level}`;
  const pages = block.pages.join("-");
  return `${block.kind}${level} · páginas ${pages} · confiança ${block.confidence.toFixed(2)} · flags: ${flagsLabel(block.flags)}`;
}

/** Plain-text report: summary plus every block of every reported page. */
export function formatInspectText(model: InspectModel): string {
  const sections = [formatSummary(model)];
  for (const page of model.pages) {
    sections.push(`== Página ${page.page} (${page.blocks.length} bloco(s)) ==`);
    if (page.blocks.length === 0) sections.push("(sem blocos)");
    for (const block of page.blocks) {
      sections.push(`[${block.id}] ${blockHeading(block)}`, block.text, "");
    }
  }
  return `${sections.join("\n")}\n`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Markdown report: each page is a table with the image on the left. */
export function formatInspectMarkdown(
  model: InspectModel,
  imageRefs: ReadonlyMap<number, string>,
): string {
  const out: string[] = [`# Inspect: ${model.file}`, "", formatSummary(model).trimEnd(), ""];
  for (const page of model.pages) {
    out.push(`## Página ${page.page}`, "");
    const image = imageRefs.get(page.page);
    const imageCell =
      image === undefined ? "(imagem indisponível)" : `![página ${page.page}](${image})`;
    const blocksCell =
      page.blocks.length === 0
        ? "(sem blocos)"
        : page.blocks
            .map(
              (block) =>
                `**${escapeHtml(block.kind)}**${block.level === undefined ? "" : ` (nível ${block.level})`} — confiança ${block.confidence.toFixed(2)} · flags: ${flagsLabel(block.flags)}\n\n> ${escapeHtml(block.text).replace(/\n/g, "\n> ")}`,
            )
            .join("\n\n");
    out.push(`| Original | Extraído |`, `| --- | --- |`, `| ${imageCell} | ${blocksCell} |`, "");
  }
  return `${out.join("\n")}\n`;
}

/** HTML report: the page image and its blocks side by side, images embedded. */
export function formatInspectHtml(
  model: InspectModel,
  imagesBase64: ReadonlyMap<number, string>,
): string {
  const pages = model.pages
    .map((page) => {
      const base64 = imagesBase64.get(page.page);
      const figure =
        base64 === undefined
          ? "<p>(imagem indisponível)</p>"
          : `<img alt="página ${page.page}" src="data:image/png;base64,${base64}">`;
      const blocks =
        page.blocks.length === 0
          ? "<p>(sem blocos)</p>"
          : page.blocks
              .map(
                (block) => `
        <article class="block${block.flags.length > 0 ? " flagged" : ""}">
          <header>
            <span class="kind">${escapeHtml(block.kind)}${block.level === undefined ? "" : ` (nível ${block.level})`}</span>
            <span class="confidence">confiança ${block.confidence.toFixed(2)}</span>
            <span class="flags">flags: ${escapeHtml(flagsLabel(block.flags))}</span>
          </header>
          <p>${escapeHtml(block.text)}</p>
        </article>`,
              )
              .join("\n");
      return `
  <section class="page">
    <figure>${figure}<figcaption>Página ${page.page}</figcaption></figure>
    <div class="blocks">${blocks}
    </div>
  </section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Inspect: ${escapeHtml(model.file)}</title>
<style>
  :root { color-scheme: light; }
  body { font: 14px/1.5 system-ui, sans-serif; margin: 0; padding: 24px; background: #f4f4f5; color: #18181b; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  pre.summary { background: #fff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 12px 16px; white-space: pre-wrap; }
  section.page { display: grid; grid-template-columns: minmax(240px, 1fr) minmax(320px, 1fr); gap: 16px; margin-top: 24px; align-items: start; }
  figure { margin: 0; background: #fff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 8px; }
  figure img { max-width: 100%; height: auto; display: block; }
  figcaption { text-align: center; color: #52525b; margin-top: 4px; }
  .blocks { display: flex; flex-direction: column; gap: 8px; }
  article.block { background: #fff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 8px 12px; }
  article.block.flagged { border-color: #fca5a5; background: #fef2f2; }
  article.block header { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: #3f3f46; margin-bottom: 4px; }
  article.block .kind { font-weight: 600; }
  article.block.flagged .flags { color: #b91c1c; font-weight: 600; }
  article.block p { margin: 0; white-space: pre-wrap; }
</style>
</head>
<body>
<h1>Inspect: ${escapeHtml(model.file)}</h1>
<pre class="summary">${escapeHtml(formatSummary(model).trimEnd())}</pre>
${pages}
</body>
</html>
`;
}

/** `explain-page` report: one section per paragraph, one line per layer. */
export function formatExplainText(explanation: PageExplanation): string {
  const out: string[] = [
    `Página ${explanation.page} de ${explanation.pageCount} · ${explanation.columns} coluna(s) · corpo ${explanation.bodyFontSize.toFixed(2)} pt · entrelinha ${explanation.lineHeight.toFixed(2)} pt`,
  ];
  if (explanation.removed.length > 0) {
    out.push("", "Removido como mobília repetida:");
    for (const removed of explanation.removed) {
      out.push(`  [${removed.band}] ${JSON.stringify(removed.text)}`);
    }
  }
  if (explanation.paragraphs.length === 0) {
    out.push("", "(nenhum parágrafo nesta página)");
  }
  for (const [index, paragraph] of explanation.paragraphs.entries()) {
    const pages = paragraph.pages.join("-");
    const level = paragraph.level === undefined ? "" : ` nível ${paragraph.level}`;
    out.push(
      "",
      `--- Bloco ${index + 1} (ordinal ${paragraph.ordinalOnPage} na página inicial) ---`,
      `kind: ${paragraph.kind}${level} · páginas ${pages} · confiança ${paragraph.confidence.toFixed(2)} · flags: ${flagsLabel(paragraph.flags)}`,
      `texto: ${paragraph.text}`,
    );
    if (paragraph.lines.length > 0) {
      out.push(`linhas (${paragraph.lines.length}):`);
      for (const line of paragraph.lines) {
        const where =
          line.side === true ? " lateral" : line.band === undefined ? "" : ` coluna ${line.band}`;
        out.push(`  p${line.page}${where}: ${JSON.stringify(line.text)}`);
      }
    }
    out.push("camadas:");
    for (const layer of paragraph.layers) {
      out.push(`  ${layer.layer}: ${layer.decision}`);
    }
  }
  return `${out.join("\n")}\n`;
}
