import type { BBox, RawNonTextRegion } from "@pagepace/schema";
import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { BBOX_DECIMALS } from "../bbox";
import type { OperatorListLike } from "./text-layer";

/**
 * Non-text region collector (E10-T01 — layer 2, "adapter").
 *
 * Walks the pdf.js operator list with the graphics-state stack and records
 * where a paint lands on the page: image XObjects, inline images, stencil
 * masks and their tiled repeats/groups (`paintImage*`), plus `constructPath`
 * when pdf.js precomputed the path box (`[fn, [data], minMax]`, pdf.js 6)
 * and the paint op is a real stroke/fill — a discarded path (`endPath`) and
 * a clip paint nothing. The CTM maps the unit square (images) or the path
 * box into user space; `view` then mirrors y exactly like `glyphBox` does
 * for text items, so both land in the same top-left page coordinates.
 *
 * Known limits: shading fills, pattern fills and annotation appearances are
 * not collected; a box with zero width or height after the deterministic
 * rounding is dropped (a hairline rule is not a region); the boxes carry no
 * stroke width (a vector path box is the geometry, not the ink).
 */

type Matrix = readonly [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** pdf.js `Util.transform(m1, m2)`: apply `m2` first, then `m1`. */
function compose(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function applyPoint(matrix: Matrix, x: number, y: number): [number, number] {
  return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
}

/** A matrix argument (`transform`, form matrix), or `null` when absent. */
function asMatrix(value: unknown): Matrix | null {
  const numbers = asNumbers(value);
  if (numbers === null || numbers.length < 6) return null;
  return [
    numbers[0] ?? 0,
    numbers[1] ?? 0,
    numbers[2] ?? 0,
    numbers[3] ?? 0,
    numbers[4] ?? 0,
    numbers[5] ?? 0,
  ];
}

/** Any array-like of numbers (`Array`, `Float32Array`), or `null`. */
function asNumbers(value: unknown): number[] | null {
  if (Array.isArray(value)) return value.every((entry) => typeof entry === "number") ? value : null;
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const view = value as unknown as ArrayLike<number>;
    const numbers: number[] = [];
    for (let index = 0; index < view.length; index++) numbers.push(view[index] as number);
    return numbers;
  }
  return null;
}

/** One numeric argument, with the fallback pdf.js would render with. */
function argNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function round(value: number): number {
  const factor = 10 ** BBOX_DECIMALS;
  return Math.round(value * factor) / factor;
}

/**
 * The axis-aligned box of `corners` (already in user space), converted to
 * top-left page coordinates with the same mirror `glyphBox` applies to text.
 */
function boxOf(
  corners: readonly (readonly [number, number])[],
  view: readonly number[],
): BBox | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of corners) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const x = round(minX - (view[0] ?? 0));
  const y = round((view[3] ?? 0) - maxY);
  const width = round(maxX - minX);
  const height = round(maxY - minY);
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

/** The unit square under `matrix` — where every image paint lands. */
function unitSquare(matrix: Matrix, view: readonly number[]): BBox | null {
  const corners: [number, number][] = [
    applyPoint(matrix, 0, 0),
    applyPoint(matrix, 1, 0),
    applyPoint(matrix, 0, 1),
    applyPoint(matrix, 1, 1),
  ];
  return boxOf(corners, view);
}

/** Paint ops that consume a `constructPath` box: strokes and fills only. */
const PAINT_PATH_OPS = new Set<number>([
  OPS.stroke,
  OPS.closeStroke,
  OPS.fill,
  OPS.eoFill,
  OPS.fillStroke,
  OPS.eoFillStroke,
  OPS.closeFillStroke,
  OPS.closeEOFillStroke,
  OPS.rawFillPath,
]);

/**
 * Every painted non-text region of one page, sorted top-left first and
 * deduplicated (the same box painted twice is one region).
 *
 * `view` is the page's `viewport.viewBox` — the same argument `glyphBox`
 * gets in `readPage`, so text and regions share one coordinate space.
 */
export function collectNonTextRegions(
  ops: OperatorListLike,
  view: readonly [number, number, number, number],
): RawNonTextRegion[] {
  const regions: RawNonTextRegion[] = [];
  const seen = new Set<string>();
  const push = (bbox: BBox | null, kind: RawNonTextRegion["kind"]): void => {
    if (bbox === null) return;
    const key = `${kind}|${bbox.x}|${bbox.y}|${bbox.width}|${bbox.height}`;
    if (seen.has(key)) return;
    seen.add(key);
    regions.push({ bbox, kind });
  };

  let ctm: Matrix = IDENTITY;
  const stack: Matrix[] = [];

  for (let index = 0; index < ops.fnArray.length; index++) {
    const fn = ops.fnArray[index];
    if (fn === undefined) continue;
    const args = ops.argsArray[index] ?? null;

    if (fn === OPS.save) {
      stack.push(ctm);
      continue;
    }
    if (fn === OPS.restore) {
      ctm = stack.pop() ?? IDENTITY;
      continue;
    }
    if (fn === OPS.transform) {
      const matrix = asMatrix(args);
      // The worker accumulates `ctm = Util.transform(ctm, args)` (pdf.js 6):
      // the new matrix applies first, the running one after — the same
      // composition `compose` mirrors.
      if (matrix !== null) ctm = compose(ctm, matrix);
      continue;
    }
    if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      const matrix = asMatrix(Array.isArray(args) ? args[0] : null);
      if (matrix !== null) ctm = compose(ctm, matrix);
      continue;
    }
    if (fn === OPS.paintFormXObjectEnd) {
      ctm = stack.pop() ?? IDENTITY;
      continue;
    }
    if (fn === OPS.constructPath) {
      const pathFn = Array.isArray(args) ? args[0] : null;
      const minMax = Array.isArray(args) ? asNumbers(args[2]) : null;
      if (typeof pathFn !== "number" || !PAINT_PATH_OPS.has(pathFn)) continue;
      if (minMax === null || minMax.length < 4) continue;
      const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = minMax;
      const corners: [number, number][] = [
        applyPoint(ctm, x0, y0),
        applyPoint(ctm, x1, y0),
        applyPoint(ctm, x0, y1),
        applyPoint(ctm, x1, y1),
      ];
      push(boxOf(corners, view), "vector");
      continue;
    }
    if (
      fn === OPS.paintImageXObject ||
      fn === OPS.paintInlineImageXObject ||
      fn === OPS.paintImageMaskXObject
    ) {
      push(unitSquare(ctm, view), "image");
      continue;
    }
    if (fn === OPS.paintImageXObjectRepeat || fn === OPS.paintImageMaskXObjectRepeat) {
      // args: image XObject `[image, scaleX, scaleY, positions]`, mask
      // `[image, scaleX, skewX, skewY, scaleY, positions]` — one translate
      // per tile, the same matrix the renderer composes per position.
      const isMask = fn === OPS.paintImageMaskXObjectRepeat;
      const values = Array.isArray(args) ? args : null;
      if (values === null) continue;
      const scaleX = argNumber(values[1], 1);
      const scaleY = argNumber(values[isMask ? 4 : 2], 1);
      const skewX = isMask ? argNumber(values[2], 0) : 0;
      const skewY = isMask ? argNumber(values[3], 0) : 0;
      const positions = asNumbers(values[isMask ? 5 : 3]);
      if (positions === null) continue;
      for (let pair = 0; pair + 1 < positions.length; pair += 2) {
        const repeat: Matrix = [
          scaleX,
          skewX,
          skewY,
          scaleY,
          positions[pair] as number,
          positions[pair + 1] as number,
        ];
        push(unitSquare(compose(ctm, repeat), view), "image");
      }
      continue;
    }
    if (fn === OPS.paintInlineImageXObjectGroup || fn === OPS.paintImageMaskXObjectGroup) {
      // Grouped tiles: every entry carries its own matrix — mask groups put
      // the list in `args[0]`, inline groups in `args[1]` after the image.
      const values = Array.isArray(args) ? args : null;
      const entries = values?.[fn === OPS.paintImageMaskXObjectGroup ? 0 : 1];
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const matrix = asMatrix(
          entry !== null && typeof entry === "object" && "transform" in entry
            ? (entry as { transform: unknown }).transform
            : null,
        );
        if (matrix === null) continue;
        push(unitSquare(compose(ctm, matrix), view), "image");
      }
      continue;
    }
  }

  regions.sort(
    (a, b) =>
      a.bbox.y - b.bbox.y ||
      a.bbox.x - b.bbox.x ||
      a.bbox.width - b.bbox.width ||
      a.bbox.height - b.bbox.height ||
      a.kind.localeCompare(b.kind),
  );
  return regions;
}
