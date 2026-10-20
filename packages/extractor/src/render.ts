import type { BBox } from "@pagepace/schema";
import type { PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * "Ver original": frame a page or a block region on a canvas (E7-T04).
 *
 * The correction screen is the only place of the app that shows the PDF
 * (ADR-003); it asks for the page or for one block's `origin.bbox` and draws
 * it here. Two pieces, both free of ambient state so the same input always
 * frames the same pixels:
 *
 * 1. `regionFrame(pageSize, target, options)` — pure geometry: where the
 *    region sits on the canvas (`offsetX`/`offsetY`), how big it is drawn
 *    (`scale`, fit by default) and what rectangle is left visible (`clip`,
 *    the region plus a padding, clamped to the canvas).
 * 2. `renderPageRegion(page, target, options)` — thin orchestration over
 *    PDF.js: builds the viewport with the frame, clips the context and
 *    calls `page.render`. The canvas is **injected** (`RenderTarget`), so
 *    the app passes its `<canvas>` and tests pass a stub — no Node canvas
 *    dependency, no new package (ADR-075).
 *
 * Coordinates: the region is a schema `BBox` — top-left page coordinates in
 * points, the very box `buildBook` writes to `origin.bbox` (ADR-074). The
 * target size is in canvas pixels (multiply CSS pixels by
 * `devicePixelRatio` before calling). Known limit: pages with a rotation
 * other than 0 frame as if unrotated — books in the corpus are rotation 0.
 */

/** Padding kept around the framed region, in canvas pixels. */
export const REGION_PADDING_DEFAULT = 8;
/** Fill behind the rendered page (the correction screen shows paper). */
export const RENDER_BACKGROUND_DEFAULT = "#ffffff";
/** A region thinner than this is inflated to it, so the fit never divides by zero. */
export const REGION_MIN_POINTS = 1;

export interface Size {
  width: number;
  height: number;
}

export interface RegionFrameOptions {
  /** Region to frame, in top-left page points. Absent = the whole page. */
  region?: BBox | null;
  /** Padding around the region, in canvas pixels. */
  padding?: number;
  /** Explicit zoom (canvas pixels per point). Absent = fit the region in the target. */
  scale?: number;
}

export interface RegionFrame {
  scale: number;
  offsetX: number;
  offsetY: number;
  /** Visible rectangle in canvas pixels (the region plus padding, clamped). */
  clip: BBox;
}

function clampRegion(size: number): number {
  return Math.max(size, REGION_MIN_POINTS);
}

function clampClip(clip: BBox, target: Size): BBox {
  const x = Math.min(Math.max(clip.x, 0), target.width);
  const y = Math.min(Math.max(clip.y, 0), target.height);
  const right = Math.min(Math.max(clip.x + clip.width, 0), target.width);
  const bottom = Math.min(Math.max(clip.y + clip.height, 0), target.height);
  return { x, y, width: Math.max(right - x, 0), height: Math.max(bottom - y, 0) };
}

/**
 * Pure geometry of "ver original": centers `region` inside `target`, scaled
 * to fit (or to `options.scale` when the caller zooms), keeping
 * `options.padding` canvas pixels around it. Everything is computed in
 * canvas pixels; the same numbers always come out (no clock, no randomness).
 */
export function regionFrame(
  pageSize: Size,
  target: Size,
  options: RegionFrameOptions = {},
): RegionFrame {
  const padding = options.padding ?? REGION_PADDING_DEFAULT;
  const region = options.region ?? { x: 0, y: 0, width: pageSize.width, height: pageSize.height };
  const regionWidth = clampRegion(region.width);
  const regionHeight = clampRegion(region.height);
  const usableWidth = Math.max(target.width - 2 * padding, 1);
  const usableHeight = Math.max(target.height - 2 * padding, 1);
  const fitScale = Math.min(usableWidth / regionWidth, usableHeight / regionHeight);
  const scale = options.scale !== undefined && options.scale > 0 ? options.scale : fitScale;
  const drawnWidth = regionWidth * scale;
  const drawnHeight = regionHeight * scale;
  const offsetX = padding + (usableWidth - drawnWidth) / 2 - region.x * scale;
  const offsetY = padding + (usableHeight - drawnHeight) / 2 - region.y * scale;
  const clip = clampClip(
    {
      x: region.x * scale + offsetX - padding,
      y: region.y * scale + offsetY - padding,
      width: drawnWidth + 2 * padding,
      height: drawnHeight + 2 * padding,
    },
    target,
  );
  return { scale, offsetX, offsetY, clip };
}

/** The 2D context calls `renderPageRegion` makes — a DOM canvas satisfies it. */
export interface RenderCanvasContext {
  save(): void;
  restore(): void;
  beginPath(): void;
  rect(x: number, y: number, width: number, height: number): void;
  clip(): void;
}

/** Canvas to draw on: in the app a `<canvas>`; in tests, any stub of the same shape. */
export interface RenderTarget extends Size {
  getContext(contextId: "2d"): RenderCanvasContext | null;
}

export interface RenderPageOptions extends RegionFrameOptions {
  /** Fill behind the page. */
  background?: string;
}

/** The PDF.js render task surface: await `promise`, or cancel the task. */
export interface RenderTaskLike {
  promise: Promise<void>;
}

/** Raised when the target refuses to give a 2D context (a broken canvas). */
export class RenderTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenderTargetError";
  }
}

/**
 * Draws `page` (or its `options.region`) on `target`, fitted and centered.
 * Synchronous start, like PDF.js itself: the returned task's `promise`
 * settles when the pixels are on the canvas (and restores the context state
 * either way); cancel it through `task.cancel()` on the underlying PDF.js
 * task when the screen goes away.
 */
export function renderPageRegion(
  page: PDFPageProxy,
  target: RenderTarget,
  options: RenderPageOptions = {},
): RenderTaskLike {
  const base = page.getViewport({ scale: 1 });
  const frame = regionFrame(
    { width: base.width, height: base.height },
    { width: target.width, height: target.height },
    options,
  );
  const viewport = page.getViewport({
    scale: frame.scale,
    offsetX: frame.offsetX,
    offsetY: frame.offsetY,
  });
  const context = target.getContext("2d");
  if (context === null) {
    throw new RenderTargetError("render target without a 2D context");
  }
  context.save();
  context.beginPath();
  context.rect(frame.clip.x, frame.clip.y, frame.clip.width, frame.clip.height);
  context.clip();
  const task = page.render({
    canvasContext: context,
    // pdf.js types demand `canvas` although the runtime defaults it to null
    // when `canvasContext` carries the surface (checked against 6.4.299).
    canvas: null,
    viewport,
    background: options.background ?? RENDER_BACKGROUND_DEFAULT,
  });
  return { promise: task.promise.finally(() => context.restore()) };
}
