import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ingestPdfjs, PDFJS_DIST_VERSION, sha256Hex } from "@pagepace/extractor";
import { parseRawDocument, SCHEMA_VERSION } from "@pagepace/schema";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { buildPdf, textStream } from "./minipdf";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const requireFromTest = createRequire(import.meta.url);
const pdfjsRoot = path.dirname(requireFromTest.resolve("pdfjs-dist/package.json"));
const publicCorpus = path.join(repoRoot, "corpus", "public");

/** pdf.js wants a plain path with forward slashes and a trailing slash (S1 §5). */
const toDataPath = (dir: string): string => `${dir.replace(/\\/g, "/").replace(/\/+$/, "")}/`;

interface ManifestEntry {
  id: string;
  pages: number;
  sha256: string;
}

/** Minimal reader for the three manifest fields these tests assert on. */
function readManifest(): ManifestEntry[] {
  const manifest = readFileSync(path.join(repoRoot, "corpus", "manifest.yaml"), "utf8");
  const entries: ManifestEntry[] = [];
  for (const block of manifest.split(/\n {2}- id: /).slice(1)) {
    const id = (block.split("\n")[0] ?? "").trim();
    const pages = Number(/(?:^|\n) {4}pages: (\d+)/.exec(block)?.[1]);
    const sha256 = /(?:^|\n) {4}sha256: "([0-9a-f]{64})"/.exec(block)?.[1];
    if (sha256 && Number.isInteger(pages)) entries.push({ id, pages, sha256 });
  }
  return entries;
}

const availableCorpus = (): ManifestEntry[] =>
  readManifest().filter((entry) => existsSync(path.join(publicCorpus, `${entry.id}.pdf`)));

const helveticaPdf = (text = "Hello, PagePace!"): Uint8Array =>
  buildPdf([textStream(text, { x: 72, y: 700, size: 14 })]);

describe("ingestPdfjs - synthetic PDFs", () => {
  it("produces a RawDocument that passes the schema validator", async () => {
    const document = await ingestPdfjs(buildPdf([textStream("first"), textStream("second")]), {
      fileName: "synthetic.pdf",
    });

    expect(() => parseRawDocument(document)).not.toThrow();
    expect(document.schemaVersion).toBe(SCHEMA_VERSION);
    expect(document.ingest).toEqual({ adapter: "pdfjs", adapterVersion: PDFJS_DIST_VERSION });
    expect(document.source.pageCount).toBe(2);
    expect(document.pages).toHaveLength(2);
    expect(document.pages[0]?.items.map((item) => item.text)).toEqual(["first"]);
    expect(document.pages[1]?.items.map((item) => item.text)).toEqual(["second"]);
    expect(document.source.tagged).toBe(false);
    expect(document.tagHints).toBeUndefined();
    expect(document.outline).toBeUndefined();
  });

  it("reports the geometry pdf.js returns, in top-left coordinates", async () => {
    const document = await ingestPdfjs(helveticaPdf(), { fileName: "geometry.pdf" });
    const [item] = document.pages[0]?.items ?? [];

    expect(item).toBeDefined();
    expect(item?.x).toBeCloseTo(72, 3);
    // Baseline at y=700 with a 14pt em box: the box starts 14 points above it.
    expect(item?.y).toBeCloseTo(686, 3);
    expect(item?.height).toBeCloseTo(14, 3);
    expect(item?.width).toBeGreaterThan(0);
    expect(item?.fontSize).toBeCloseTo(14, 3);
    expect(item?.fontName).toBe("Helvetica");
  });

  it("computes source.sha256 with the same value as node:crypto", async () => {
    const bytes = helveticaPdf();
    const document = await ingestPdfjs(bytes, { fileName: "digest.pdf" });
    const reference = createHash("sha256").update(bytes).digest("hex");

    expect(document.source.sha256).toBe(reference);
    expect(document.source.sha256).toBe(sha256Hex(bytes));
    expect(document.source.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic: the same bytes produce byte-identical JSON", async () => {
    const bytes = buildPdf(
      [textStream("one", { x: 72, y: 700 }), textStream("two", { x: 72, y: 680, size: 9 })],
      { tagged: true },
    );
    const first = await ingestPdfjs(bytes, { fileName: "det.pdf" });
    const second = await ingestPdfjs(bytes, { fileName: "det.pdf" });

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("honours an inclusive 1-based pageRange", async () => {
    const bytes = buildPdf([textStream("p1"), textStream("p2"), textStream("p3")]);
    const document = await ingestPdfjs(bytes, {
      fileName: "range.pdf",
      pageRange: { from: 2, to: 3 },
    });

    expect(document.source.pageCount).toBe(3);
    expect(document.pages.map((page) => page.index)).toEqual([1, 2]);
    expect(document.pages[0]?.items[0]?.text).toBe("p2");
  });

  it("reads the outline, resolving destinations to page indexes", async () => {
    const bytes = buildPdf([textStream("one"), textStream("two"), textStream("three")], {
      outlines: [
        { title: "First", pageIndex: 0, children: [{ title: "Nested", pageIndex: 2 }] },
        { title: "Second", pageIndex: 1 },
      ],
    });
    const document = await ingestPdfjs(bytes, { fileName: "outline.pdf" });

    expect(document.outline).toEqual([
      { title: "First", pageIndex: 0, children: [{ title: "Nested", pageIndex: 2 }] },
      { title: "Second", pageIndex: 1 },
    ]);
  });

  it("turns a struct tree into tag hints without leaking the raw tree", async () => {
    const bytes = buildPdf([textStream("tagged", { markRole: "P", mcid: 0 })], { tagged: true });
    const document = await ingestPdfjs(bytes, { fileName: "tagged.pdf" });

    expect(document.source.tagged).toBe(true);
    expect(document.tagHints?.reliable).toBe(true);
    expect(document.tagHints?.paragraphs).toEqual([
      { page: 0, bbox: { x: 72, y: 388, width: expect.any(Number), height: 12 } },
    ]);
    expect(JSON.stringify(document)).not.toContain("StructElem");
    expect(Object.keys(document)).not.toContain("structTree");
  });

  it("rejects an empty input and a missing file name", async () => {
    await expect(ingestPdfjs(new Uint8Array(0), { fileName: "x.pdf" })).rejects.toThrow(RangeError);
    await expect(ingestPdfjs(helveticaPdf(), { fileName: "   " })).rejects.toThrow(RangeError);
  });

  it("rejects a pageRange outside the document", async () => {
    const bytes = helveticaPdf();
    await expect(
      ingestPdfjs(bytes, { fileName: "x.pdf", pageRange: { from: 5, to: 9 } }),
    ).rejects.toThrow(RangeError);
  });
});

describe("ingestPdfjs - standard fonts (ADR-020 / S5)", () => {
  it("extracts identical geometry for non-embedded Helvetica with and without the pdf.js fonts", async () => {
    const bytes = buildPdf([
      textStream("Hello Helvetica, width matters.", { x: 72, y: 700, size: 24 }),
    ]);
    const emptyDir = await mkdtemp(path.join(tmpdir(), "pagepace-nofonts-"));
    try {
      const withFonts = await ingestPdfjs(bytes, {
        fileName: "helvetica.pdf",
        assets: { standardFontDataUrl: toDataPath(path.join(pdfjsRoot, "standard_fonts")) },
      });
      const withoutFonts = await ingestPdfjs(bytes, {
        fileName: "helvetica.pdf",
        assets: { standardFontDataUrl: toDataPath(emptyDir) },
      });

      expect(withoutFonts.pages[0]?.items).toHaveLength(1);
      const [a] = withFonts.pages[0]?.items ?? [];
      const [b] = withoutFonts.pages[0]?.items ?? [];
      expect(b?.text).toBe(a?.text);
      expect(b?.x).toBeCloseTo(a?.x ?? Number.NaN, 6);
      expect(b?.y).toBeCloseTo(a?.y ?? Number.NaN, 6);
      expect(b?.width).toBeCloseTo(a?.width ?? Number.NaN, 6);
      expect(b?.fontName).toBe(a?.fontName);
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("ingestPdfjs - public corpus (needs `corpus/public`, skipped until E1-T05)", () => {
  const entries = availableCorpus();

  it.skipIf(entries.length === 0)(
    "validates every public PDF, with page counts and digests matching the manifest",
    async () => {
      for (const entry of entries) {
        const bytes = new Uint8Array(await readFile(path.join(publicCorpus, `${entry.id}.pdf`)));
        const document = await ingestPdfjs(bytes, { fileName: `${entry.id}.pdf` });

        expect(() => parseRawDocument(document)).not.toThrow();
        expect(document.source.pageCount, entry.id).toBe(entry.pages);
        expect(document.source.sha256, entry.id).toBe(entry.sha256);
        expect(
          document.pages.reduce((total, page) => total + page.items.length, 0),
          entry.id,
        ).toBeGreaterThan(0);
      }
    },
    300_000,
  );

  it.skipIf(entries.length < 1)(
    "is deterministic on a real PDF",
    async () => {
      const entry = entries[0] as ManifestEntry;
      const bytes = new Uint8Array(await readFile(path.join(publicCorpus, `${entry.id}.pdf`)));
      const first = await ingestPdfjs(bytes, { fileName: `${entry.id}.pdf` });
      const second = await ingestPdfjs(bytes, { fileName: `${entry.id}.pdf` });

      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    },
    300_000,
  );
});

describe("pdfjs-dist API smoke test (fails when pdf.js changes)", () => {
  it("exposes the calls the adapter depends on", async () => {
    const task = getDocument({ data: helveticaPdf(), fontExtraProperties: true, verbosity: 0 });
    expect(typeof task.destroy).toBe("function");
    try {
      const pdf = await task.promise;
      expect(typeof pdf.numPages).toBe("number");
      expect(typeof pdf.getMetadata).toBe("function");
      expect(typeof pdf.getOutline).toBe("function");

      const markInfo: unknown = await pdf.getMarkInfo();
      // pdf.js returns a `Map` when `/MarkInfo` exists and `null` otherwise,
      // although the TypeScript types claim it is always an object (S3 §5).
      expect(markInfo === null || markInfo instanceof Map).toBe(true);
      if (markInfo instanceof Map) expect(markInfo.get("Marked")).toBe(false);

      const page = await pdf.getPage(1);
      expect(typeof page.getStructTree).toBe("function");
      expect(typeof page.getViewport).toBe("function");

      const text = await page.getTextContent({ includeMarkedContent: true });
      expect(Array.isArray(text.items)).toBe(true);
      expect(text.items[0]).toMatchObject({ str: "Hello, PagePace!" });

      await page.getOperatorList();
      const structTree: unknown = await page.getStructTree();
      expect(structTree).toBeNull(); // untagged document

      page.cleanup();
    } finally {
      await task.destroy();
    }
  }, 30_000);

  it("pins the exact pdfjs-dist version the adapter was written against", () => {
    const extractorPackage = JSON.parse(
      readFileSync(path.join(repoRoot, "packages", "extractor", "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    const installed = JSON.parse(readFileSync(path.join(pdfjsRoot, "package.json"), "utf8")) as {
      version: string;
    };

    expect(extractorPackage.dependencies["pdfjs-dist"]).toBe("6.4.299");
    expect(PDFJS_DIST_VERSION).toBe("6.4.299");
    expect(installed.version).toBe(PDFJS_DIST_VERSION);
  });
});
