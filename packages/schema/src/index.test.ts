import { describe, expect, it } from "vitest";
import {
  invalidFixtures,
  validAnchor,
  validBook,
  validBookOcrTextLayer,
  validOverlay,
  validRawDocument,
  validRawDocumentOcrTextLayer,
} from "./fixtures";
import {
  PACKAGE_NAME,
  parseAnchor,
  parseBook,
  parseOverlay,
  parseRawDocument,
  SCHEMA_VERSION,
  SchemaValidationError,
  safeParseAnchor,
  safeParseBook,
  safeParseOverlay,
  safeParseRawDocument,
} from "./index";

const safeParser = {
  RawDocument: safeParseRawDocument,
  Book: safeParseBook,
  Overlay: safeParseOverlay,
  Anchor: safeParseAnchor,
} as const;

describe("@pagepace/schema", () => {
  it("exposes the package name", () => {
    expect(PACKAGE_NAME).toBe("@pagepace/schema");
  });

  it("publishes schema version 1.1.0", () => {
    expect(SCHEMA_VERSION).toBe("1.1.0");
  });
});

describe("valid fixtures round-trip", () => {
  it("parses the sample RawDocument", () => {
    expect(parseRawDocument(validRawDocument)).toEqual(validRawDocument);
  });

  it("parses the OCR-text-layer RawDocument (ADR-019 flag on `source`)", () => {
    const document = parseRawDocument(validRawDocumentOcrTextLayer);
    expect(document.source.ocrTextLayer).toBe(true);
    // Absent (not false) on a normal document: consumers test truthiness.
    expect(parseRawDocument(validRawDocument).source.ocrTextLayer).toBeUndefined();
  });

  it("parses the sample Book", () => {
    expect(parseBook(validBook)).toEqual(validBook);
  });

  it("parses the OCR-text-layer Book (ADR-019 warning contract)", () => {
    const book = parseBook(validBookOcrTextLayer);
    expect(book.extraction.warnings).toContain("ocr-text-layer");
  });

  it("parses the sample Overlay with every correction op", () => {
    const overlay = parseOverlay(validOverlay);
    expect(overlay.ops.map((op) => op.op)).toEqual([
      "merge_with_next",
      "split_at",
      "set_kind",
      "delete_block",
      "edit_text",
      "set_style",
    ]);
  });

  it("parses the sample Anchor", () => {
    expect(parseAnchor(validAnchor)).toEqual(validAnchor);
  });
});

describe("invalid fixtures are rejected", () => {
  for (const fixture of invalidFixtures) {
    it(`${fixture.target}: ${fixture.name} — ${fixture.reason}`, () => {
      const result = safeParser[fixture.target](fixture.data);
      expect(result.ok).toBe(false);
    });
  }
});

describe("the raw struct tree never leaks", () => {
  it("rejects a RawDocument carrying a raw structTree", () => {
    const result = safeParser.RawDocument({
      ...validRawDocument,
      structTree: { type: "Document", kids: [] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.path.includes("structTree"))).toBe(true);
    }
  });

  it("keeps only normalized boxes in tagHints", () => {
    const result = safeParser.RawDocument({
      ...validRawDocument,
      tagHints: { ...validRawDocument.tagHints, tree: { type: "P" } },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.path.includes("tree"))).toBe(true);
    }
  });
});

describe("parse helpers", () => {
  it("throws SchemaValidationError listing every issue", () => {
    expect(() => parseBook({})).toThrow(SchemaValidationError);
    try {
      parseBook({});
      expect.unreachable("parseBook({}) should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaValidationError);
      const issues = (error as SchemaValidationError).issues;
      expect(issues.length).toBeGreaterThan(1);
      expect(issues.every((issue) => issue.path.length > 0)).toBe(true);
    }
  });

  it("safeParseAnchor keeps the typed Anchor on success", () => {
    const result = safeParseAnchor(validAnchor);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.blockId).toBe(validAnchor.blockId);
    }
  });

  it("safeParseOverlay does not throw on garbage input", () => {
    const result = safeParseOverlay("not an overlay");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });
});
