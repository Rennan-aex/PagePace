import type { BBox } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import type { PageTagInput } from "./tag-hints";
import { buildTagHints } from "./tag-hints";

const VIEW: [number, number, number, number] = [0, 0, 600, 800];

interface ContentNode {
  type: string;
  id: string;
}

const content = (id: string): ContentNode => ({ type: "content", id });

interface NodeInput {
  role?: string;
  children?: unknown[];
  bbox?: number[];
  alt?: string;
}

const node = (input: NodeInput): NodeInput => input;

const boxes = (...entries: [string, BBox][]): Map<string, BBox> => new Map(entries);

const MC: [string, BBox][] = [
  ["MC0", { x: 72, y: 100, width: 400, height: 12 }],
  ["MC1", { x: 72, y: 120, width: 300, height: 12 }],
  ["MC2", { x: 72, y: 140, width: 300, height: 12 }],
];

const page = (input: Partial<PageTagInput> = {}): PageTagInput => ({
  index: 0,
  view: VIEW,
  tree: null,
  hasText: true,
  mcidBoxes: boxes(...MC),
  ...input,
});

describe("buildTagHints", () => {
  it("returns undefined when the document declares no marking and has no tree", () => {
    expect(buildTagHints({ marked: false, pages: [page(), page({ index: 1 })] })).toBeUndefined();
  });

  it("keeps paragraph hints from a tree even when MarkInfo.Marked is false", () => {
    const hints = buildTagHints({
      marked: false,
      pages: [
        page({
          tree: node({
            role: "Document",
            children: [
              node({ role: "P", children: [content("MC0")] }),
              node({ role: "Span", children: [content("MC1")] }),
            ],
          }),
        }),
      ],
    });

    expect(hints?.reliable).toBe(false);
    expect(hints?.paragraphs).toEqual([
      { page: 0, bbox: { x: 72, y: 100, width: 400, height: 12 } },
    ]);
  });

  it("accepts a tagged document with P blocks and reports it as reliable", () => {
    const hints = buildTagHints({
      marked: true,
      pages: [
        page({
          tree: node({
            role: "Document",
            children: [
              node({ role: "H1", children: [content("MC0")] }),
              node({ role: "P", children: [content("MC1")] }),
              node({ role: "P", children: [content("MC2")] }),
            ],
          }),
        }),
      ],
    });

    expect(hints?.reliable).toBe(true);
    expect(hints?.paragraphs).toHaveLength(2);
    expect(hints?.figures).toEqual([]);
  });

  it("is not reliable when a text page has no usable tree (coverage below 90%)", () => {
    const hints = buildTagHints({
      marked: true,
      pages: [
        page({
          tree: node({
            role: "Document",
            children: [node({ role: "P", children: [content("MC0")] })],
          }),
        }),
        page({ index: 1, tree: null }),
      ],
    });

    expect(hints?.reliable).toBe(false);
    expect(hints?.paragraphs).toHaveLength(1);
  });

  it("is not reliable when a block sits under an inline parent (inverted hierarchy)", () => {
    const hints = buildTagHints({
      marked: true,
      pages: [
        page({
          tree: node({
            role: "P",
            children: [node({ role: "Sect", children: [content("MC0")] })],
          }),
        }),
      ],
    });

    expect(hints?.reliable).toBe(false);
  });

  it("is not reliable when a non-standard role appears", () => {
    const hints = buildTagHints({
      marked: true,
      pages: [
        page({
          tree: node({
            role: "Document",
            children: [
              node({ role: "P", children: [content("MC0")] }),
              node({ role: "FooBar", children: [content("MC1")] }),
            ],
          }),
        }),
      ],
    });

    expect(hints?.reliable).toBe(false);
  });

  it("ignores nodes without a role instead of treating them as a defect (S3 §4.4)", () => {
    const hints = buildTagHints({
      marked: true,
      pages: [
        page({
          tree: node({
            role: "Document",
            children: [
              node({ children: [content("MC0")] }),
              node({ role: "P", children: [content("MC1")] }),
              node({ role: "P", children: [content("MC2")] }),
            ],
          }),
        }),
      ],
    });

    expect(hints?.reliable).toBe(true);
    expect(hints?.paragraphs).toHaveLength(2);
  });

  it("is not reliable when P/Sect-style blocks are not dominant", () => {
    const hints = buildTagHints({
      marked: true,
      pages: [
        page({
          tree: node({
            role: "Document",
            children: [
              node({ role: "Span", children: [content("MC0")] }),
              node({ role: "Span", children: [content("MC1")] }),
              node({ role: "Link", children: [content("MC2")] }),
              node({ role: "P", children: [content("MC0")] }),
            ],
          }),
        }),
      ],
    });

    expect(hints?.reliable).toBe(false);
  });

  it("converts a Figure bbox from PDF space (origin bottom-left) to page space", () => {
    const hints = buildTagHints({
      marked: true,
      pages: [
        page({
          tree: node({
            role: "Document",
            children: [
              node({ role: "P", children: [content("MC0")] }),
              node({ role: "Figure", bbox: [100, 500, 300, 700] }),
            ],
          }),
        }),
      ],
    });

    expect(hints?.figures).toEqual([
      { page: 0, bbox: { x: 100, y: 100, width: 200, height: 200 } },
    ]);
  });

  it("falls back to the marked-content boxes when a Figure has no bbox", () => {
    const hints = buildTagHints({
      marked: true,
      pages: [
        page({
          tree: node({
            role: "Document",
            children: [node({ role: "Figure", children: [content("MC0")] })],
          }),
        }),
      ],
    });

    expect(hints?.figures).toEqual([{ page: 0, bbox: { x: 72, y: 100, width: 400, height: 12 } }]);
  });

  it("keeps a non-empty alt text and drops a blank one", () => {
    const withAlt = buildTagHints({
      marked: true,
      pages: [
        page({
          tree: node({
            role: "Document",
            children: [node({ role: "Figure", bbox: [0, 0, 10, 10], alt: "  diagram  " })],
          }),
        }),
      ],
    });
    const blankAlt = buildTagHints({
      marked: true,
      pages: [
        page({
          tree: node({
            role: "Document",
            children: [node({ role: "Figure", bbox: [0, 0, 10, 10], alt: "   " })],
          }),
        }),
      ],
    });

    expect(withAlt?.figures[0]?.alt).toBe("diagram");
    expect(blankAlt?.figures[0]?.alt).toBeUndefined();
  });

  it("drops paragraph hints that have no geometry at all", () => {
    const hints = buildTagHints({
      marked: true,
      pages: [
        page({
          tree: node({
            role: "Document",
            children: [node({ role: "P" }), node({ role: "P", children: [content("MC0")] })],
          }),
        }),
      ],
    });

    expect(hints?.paragraphs).toEqual([
      { page: 0, bbox: { x: 72, y: 100, width: 400, height: 12 } },
    ]);
  });

  it("is deterministic: the same input produces the same output", () => {
    const input = {
      marked: true,
      pages: [
        page({
          tree: node({
            role: "Document",
            children: [
              node({ role: "P", children: [content("MC0")] }),
              node({ role: "Figure", bbox: [1, 2, 3, 4] }),
            ],
          }),
        }),
      ],
    };

    expect(buildTagHints(input)).toEqual(buildTagHints(input));
    expect(JSON.stringify(buildTagHints(input))).toBe(JSON.stringify(buildTagHints(input)));
  });
});
