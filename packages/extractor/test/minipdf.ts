/**
 * Minimal PDF writer for the ingestion tests.
 *
 * It emits only what the tests need: one or more pages with a Type 1 font
 * (optionally non-embedded, which is the case that exercises the standard
 * fonts of pdf.js), an optional struct tree, an optional outline and the
 * optional `/Info` + `/Lang` metadata (E4-T04). Offsets
 * are computed while writing, so the xref table is always correct.
 *
 * Nothing here reaches production code: the helper lives under `test/`.
 */

export interface OutlineSpec {
  title: string;
  pageIndex: number;
  children?: OutlineSpec[];
}

export interface BuildPdfOptions {
  /** `BaseFont` of the default `F1` resource. Defaults to `Helvetica`. */
  baseFont?: string;
  /**
   * Font resources by name (`F1`, `F2`, ...) → `BaseFont`. Defaults to
   * `{ F1: baseFont }`. Every resource is written as a non-embedded Type 1
   * font with `/Encoding /WinAnsiEncoding`, which is what pdf.js needs to
   * decode accented Latin-1 text with the standard 14 fonts.
   */
  fonts?: Record<string, string>;
  /** Build a struct tree (`Document > P`, one `MCID` per page). */
  tagged?: boolean;
  /** Build an `/Outlines` tree. */
  outlines?: OutlineSpec[];
  /** `/Info` dictionary entries (E4-T04: the path that reads Title/Author). */
  info?: { Title?: string; Author?: string };
  /** Catalog `/Lang` entry (E4-T04: free-form, e.g. `pt-BR`). */
  lang?: string;
  mediaBox?: [number, number, number, number];
}

export interface TextStreamOptions {
  x?: number;
  y?: number;
  size?: number;
  /** Font resource of this text object. Defaults to `F1`. */
  font?: string;
  /** Emit `/Role <</MCID n>> BDC ... EMC` around the text. */
  markRole?: string;
  mcid?: number;
  /** Text rendering mode (`Tr`) before the show op — `3` is invisible (ADR-019). */
  renderMode?: number;
}

const escapeLiteral = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

/** A `BT ... ET` content stream showing `text` at a baseline position. */
export function textStream(text: string, options: TextStreamOptions = {}): string {
  const { x = 72, y = 400, size = 12, font = "F1", markRole, mcid = 0, renderMode } = options;
  const mode = renderMode === undefined ? "" : `${renderMode} Tr `;
  const body = markRole
    ? `/${markRole} <</MCID ${mcid}>> BDC ${mode}(${escapeLiteral(text)}) Tj EMC`
    : `${mode}(${escapeLiteral(text)}) Tj`;
  return `BT /${font} ${size} Tf ${x} ${y} Td ${body} ET`;
}

export interface LineRun {
  text: string;
  /** Font resource of this run. Defaults to `F1`. */
  font?: string;
  /** Per-run font size (pt). Defaults to the line's `size`. */
  size?: number;
  /**
   * Text rise (`Ts`, E5-T02): lifts the baseline of this run above the
   * line's, which is how a superscript call is typeset in real PDFs. The
   * extractor reads the rise back as `Run.sup`.
   */
  rise?: number;
}

export interface LineStreamOptions {
  x?: number;
  y?: number;
  size?: number;
}

/**
 * A single text object holding several styled runs on one line: the text
 * matrix advances automatically between the `Tj` operators, so runs sit at
 * the right x without any width table (the layout engine of the synthetic
 * generator, E1-T07, relies on this).
 */
export function lineStream(runs: readonly LineRun[], options: LineStreamOptions = {}): string {
  const { x = 72, y = 400, size = 12 } = options;
  if (runs.length === 0) throw new Error("lineStream: at least one run is required");
  const body = runs
    .map((run, index) => {
      const text = `(${escapeLiteral(run.text)}) Tj`;
      const runSize = run.size ?? size;
      // Text rise (E5-T02): only a run that asks for it emits `Ts`, and the
      // line baseline is restored right after its `Tj` — a line without
      // `rise`/`size` runs come out byte-identical to the old writer.
      const rise = run.rise === undefined ? "" : `${run.rise} Ts `;
      const reset = run.rise === undefined ? "" : " 0 Ts";
      return index === 0
        ? `/${run.font ?? "F1"} ${runSize} Tf ${rise}${x} ${y} Td ${text}${reset}`
        : ` /${run.font ?? "F1"} ${runSize} Tf ${rise}${text}${reset}`;
    })
    .join("");
  return `BT ${body} ET`;
}

interface OutlineRecord {
  spec: OutlineSpec;
  parent: OutlineRecord | null;
  prev: OutlineRecord | null;
  next: OutlineRecord | null;
  children: OutlineRecord[];
}

function linkOutline(specs: OutlineSpec[], parent: OutlineRecord | null): OutlineRecord[] {
  const records: OutlineRecord[] = specs.map((spec) => ({
    spec,
    parent,
    prev: null,
    next: null,
    children: [],
  }));
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (!record) continue;
    record.prev = records[index - 1] ?? null;
    record.next = records[index + 1] ?? null;
    record.children = linkOutline(record.spec.children ?? [], record);
  }
  return records;
}

function flattenOutline(records: OutlineRecord[], output: OutlineRecord[] = []): OutlineRecord[] {
  for (const record of records) {
    output.push(record);
    flattenOutline(record.children, output);
  }
  return output;
}

/**
 * Writes `contentStreams` (one per page) into a complete PDF file.
 * Object numbering: 1 catalog, 2 pages, pages, contents, font, then the
 * optional struct tree and outline.
 */
export function buildPdf(contentStreams: string[], options: BuildPdfOptions = {}): Uint8Array {
  if (contentStreams.length === 0) throw new Error("buildPdf: at least one page is required");
  const {
    baseFont = "Helvetica",
    fonts,
    tagged = false,
    outlines,
    info,
    lang,
    mediaBox = [0, 0, 600, 800],
  } = options;
  const pageCount = contentStreams.length;

  const objects: string[] = [];
  const push = (body: string): number => {
    objects.push(body);
    return objects.length;
  };

  const catalogNumber = push(""); // placeholder, filled at the end
  const pagesNumber = push("");
  const pageNumbers: number[] = [];
  for (let index = 0; index < pageCount; index++) {
    pageNumbers.push(push(""));
  }
  const contentNumbers: number[] = [];
  for (const stream of contentStreams) {
    contentNumbers.push(push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`));
  }
  const fontEntries = Object.entries(fonts ?? { F1: baseFont });
  const fontNumbers = new Map<string, number>();
  for (const [resource, base] of fontEntries) {
    fontNumbers.set(
      resource,
      push(`<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>`),
    );
  }
  const fontResources = [...fontNumbers]
    .map(([name, number]) => `/${name} ${number} 0 R`)
    .join(" ");

  const langEntry = lang === undefined ? "" : ` /Lang (${escapeLiteral(lang)})`;

  // `/Info` dictionary: only the entries the tests exercise (E4-T04).
  let infoNumber = 0;
  if (info?.Title !== undefined || info?.Author !== undefined) {
    const infoParts: string[] = [];
    if (info?.Title !== undefined) infoParts.push(`/Title (${escapeLiteral(info.Title)})`);
    if (info?.Author !== undefined) infoParts.push(`/Author (${escapeLiteral(info.Author)})`);
    infoNumber = push(`<< ${infoParts.join(" ")} >>`);
  }

  // One `P` element per marked-content id; ids restart at 0 on each page.
  const structNumbers: number[] = [];
  if (tagged) {
    const rootNumber = push("");
    const documentNumber = push("");
    for (let index = 0; index < pageCount; index++) {
      // `/Pg` is mandatory: pdf.js drops an integer MCID kid whose page does
      // not match the page the tree is being built for.
      structNumbers.push(
        push(
          `<< /Type /StructElem /S /P /P ${documentNumber} 0 R /Pg ${pageNumbers[index]} 0 R /K [0] >>`,
        ),
      );
    }
    const parentTreeNumber = push(
      `<< /Nums [${structNumbers
        .map((structNumber, index) => `${index} [${structNumber} 0 R]`)
        .join(" ")}] >>`,
    );
    const structBody = `<< /Type /StructTreeRoot /K [${documentNumber} 0 R] /ParentTree ${parentTreeNumber} 0 R >>`;
    objects[rootNumber - 1] = structBody;
    objects[documentNumber - 1] =
      `<< /Type /StructElem /S /Document /P ${rootNumber} 0 R /K [${structNumbers
        .map((number) => `${number} 0 R`)
        .join(" ")}] >>`;
    objects[catalogNumber - 1] =
      `<< /Type /Catalog /Pages ${pagesNumber} 0 R /StructTreeRoot ${rootNumber} 0 R /MarkInfo << /Marked true >>${langEntry} >>`;
  } else {
    objects[catalogNumber - 1] = `<< /Type /Catalog /Pages ${pagesNumber} 0 R${langEntry} >>`;
  }

  const outlineFlat: OutlineRecord[] =
    outlines && outlines.length > 0 ? flattenOutline(linkOutline(outlines, null)) : [];
  const outlineRecordNumbers = new Map<OutlineRecord, number>();
  let outlineRootNumber = 0;
  if (outlineFlat.length > 0) {
    outlineRootNumber = push("");
    for (const record of outlineFlat) outlineRecordNumbers.set(record, push(""));
    const rootFirst = outlineRecordNumbers.get(outlineFlat[0] as OutlineRecord);
    const rootLast = outlineRecordNumbers.get(outlineFlat[outlineFlat.length - 1] as OutlineRecord);
    objects[outlineRootNumber - 1] =
      `<< /Type /Outlines /First ${rootFirst} 0 R /Last ${rootLast} 0 R /Count ${outlineFlat.length} >>`;
    const catalog = objects[catalogNumber - 1] ?? "";
    objects[catalogNumber - 1] = catalog.replace(/ >>$/, ` /Outlines ${outlineRootNumber} 0 R >>`);
  }

  objects[pagesNumber - 1] =
    `<< /Type /Pages /Kids [${pageNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pageCount} >>`;

  for (let index = 0; index < pageCount; index++) {
    const structParents = tagged ? ` /StructParents ${index}` : "";
    objects[(pageNumbers[index] as number) - 1] =
      `<< /Type /Page /Parent ${pagesNumber} 0 R /MediaBox [${mediaBox.join(" ")}]` +
      ` /Contents ${contentNumbers[index]} 0 R /Resources << /Font << ${fontResources} >> >>` +
      `${structParents} >>`;
  }

  // Outline entries: title, destination, parent and sibling links.
  for (const [record, number] of outlineRecordNumbers) {
    const parts = [
      `/Title (${escapeLiteral(record.spec.title)})`,
      `/Parent ${record.parent ? outlineRecordNumbers.get(record.parent) : outlineRootNumber} 0 R`,
      `/Dest [${pageNumbers[record.spec.pageIndex]} 0 R /XYZ null null null]`,
    ];
    if (record.prev) parts.push(`/Prev ${outlineRecordNumbers.get(record.prev)} 0 R`);
    if (record.next) parts.push(`/Next ${outlineRecordNumbers.get(record.next)} 0 R`);
    if (record.children.length > 0) {
      const first = record.children[0] as OutlineRecord;
      const last = record.children[record.children.length - 1] as OutlineRecord;
      parts.push(
        `/First ${outlineRecordNumbers.get(first)} 0 R`,
        `/Last ${outlineRecordNumbers.get(last)} 0 R`,
        `/Count ${record.children.length}`,
      );
    }
    objects[number - 1] = `<< ${parts.join(" ")} >>`;
  }

  let body = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = body.length;
  const infoRef = infoNumber === 0 ? "" : ` /Info ${infoNumber} 0 R`;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index++) {
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${infoRef} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, "latin1"));
}
