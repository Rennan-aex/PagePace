import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { collectNonTextRegions } from "./non-text";
import type { OperatorListLike } from "./text-layer";

/** `[0, 0, 600, 800]`: the default media box of `minipdf`, y up. */
const VIEW: [number, number, number, number] = [0, 0, 600, 800];

type Entry = readonly [number, unknown?];

/** Fake operator list; pdf.js stores plain values (objects, numbers) in
 * `argsArray`, so entries are cast to the type the collector reads. */
function ops(...entries: Entry[]): OperatorListLike {
  return {
    fnArray: entries.map(([fn]) => fn),
    argsArray: entries.map(([, args]) =>
      args === undefined ? null : (args as unknown as readonly unknown[]),
    ),
  };
}

const pathData = new Float32Array([0, 0, 1, 1]);

describe("collectNonTextRegions", () => {
  it("returns nothing for an empty operator list", () => {
    expect(collectNonTextRegions(ops(), VIEW)).toEqual([]);
  });

  it("maps an image XObject through its transform, y mirrored like glyphBox", () => {
    const regions = collectNonTextRegions(
      ops(
        [OPS.save],
        [OPS.transform, [200, 0, 0, 150, 72, 600]],
        [OPS.paintImageXObject, ["img"]],
        [OPS.restore],
      ),
      VIEW,
    );
    expect(regions).toEqual([{ bbox: { x: 72, y: 50, width: 200, height: 150 }, kind: "image" }]);
  });

  it("restores the matrix after Q so the next image is not displaced", () => {
    const regions = collectNonTextRegions(
      ops(
        [OPS.save],
        [OPS.transform, [200, 0, 0, 150, 72, 600]],
        [OPS.restore],
        [OPS.paintImageXObject, ["img"]],
      ),
      VIEW,
    );
    expect(regions).toEqual([{ bbox: { x: 0, y: 799, width: 1, height: 1 }, kind: "image" }]);
  });

  it("composes nested transforms in content order (earlier cm outer)", () => {
    const regions = collectNonTextRegions(
      ops(
        [OPS.transform, [1, 0, 0, 1, 10, 20]],
        [OPS.transform, [2, 0, 0, 3, 0, 0]],
        [OPS.paintImageXObject, ["img"]],
      ),
      VIEW,
    );
    // translate(10,20) then scale(2,3): the scale is the inner matrix, so
    // (0,0) → (0,0) → (10,20) and (1,1) → (2,3) → (12,23).
    expect(regions).toEqual([{ bbox: { x: 10, y: 777, width: 2, height: 3 }, kind: "image" }]);
  });

  it("reads a painted vector path from the precomputed pdf.js path box", () => {
    const regions = collectNonTextRegions(
      ops([OPS.constructPath, [OPS.stroke, [pathData], new Float32Array([50, 100, 250, 300])]]),
      VIEW,
    );
    expect(regions).toEqual([{ bbox: { x: 50, y: 500, width: 200, height: 200 }, kind: "vector" }]);
  });

  it("ignores paths that are not painted (endPath, clip)", () => {
    const box = new Float32Array([50, 100, 250, 300]);
    expect(
      collectNonTextRegions(ops([OPS.constructPath, [OPS.endPath, [pathData], box]]), VIEW),
    ).toEqual([]);
    expect(
      collectNonTextRegions(ops([OPS.constructPath, [OPS.clip, [pathData], box]]), VIEW),
    ).toEqual([]);
  });

  it("drops a degenerate path box (a hairline rule paints no region)", () => {
    const regions = collectNonTextRegions(
      ops([OPS.constructPath, [OPS.stroke, [pathData], new Float32Array([10, 10, 10, 50])]]),
      VIEW,
    );
    expect(regions).toEqual([]);
  });

  it("expands a tiled image repeat into one region per position", () => {
    const regions = collectNonTextRegions(
      ops([OPS.paintImageXObjectRepeat, ["img", 2, 3, new Float32Array([10, 20, 40, 50])]]),
      VIEW,
    );
    expect(regions).toEqual([
      { bbox: { x: 40, y: 747, width: 2, height: 3 }, kind: "image" },
      { bbox: { x: 10, y: 777, width: 2, height: 3 }, kind: "image" },
    ]);
  });

  it("applies the form XObject matrix between begin and end", () => {
    const regions = collectNonTextRegions(
      ops(
        [OPS.paintFormXObjectBegin, [[1, 0, 0, 1, 100, 100], null]],
        [OPS.paintImageXObject, ["img"]],
        [OPS.paintFormXObjectEnd],
      ),
      VIEW,
    );
    expect(regions).toEqual([{ bbox: { x: 100, y: 699, width: 1, height: 1 }, kind: "image" }]);
  });

  it("counts an inline image and a stencil mask as image regions", () => {
    const inline = collectNonTextRegions(
      ops([OPS.paintInlineImageXObject, [{ width: 4, height: 4 }]]),
      VIEW,
    );
    expect(inline).toEqual([{ bbox: { x: 0, y: 799, width: 1, height: 1 }, kind: "image" }]);
    const mask = collectNonTextRegions(
      ops([OPS.paintImageMaskXObject, [{ width: 4, height: 4 }]]),
      VIEW,
    );
    expect(mask).toEqual([{ bbox: { x: 0, y: 799, width: 1, height: 1 }, kind: "image" }]);
  });

  it("deduplicates identical paints and sorts regions top-left first", () => {
    const regions = collectNonTextRegions(
      ops(
        [OPS.paintImageXObject, ["img"]],
        [OPS.paintImageXObject, ["img"]],
        [OPS.transform, [10, 0, 0, 10, 100, 100]],
        [OPS.paintImageXObject, ["img"]],
      ),
      VIEW,
    );
    expect(regions).toEqual([
      { bbox: { x: 100, y: 690, width: 10, height: 10 }, kind: "image" },
      { bbox: { x: 0, y: 799, width: 1, height: 1 }, kind: "image" },
    ]);
  });
});
