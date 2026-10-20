import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { buildPdf, textStream } from "../test/minipdf";
import type { RenderCanvasContext } from "./render";
import {
  REGION_PADDING_DEFAULT,
  RENDER_BACKGROUND_DEFAULT,
  RenderTargetError,
  regionFrame,
  renderPageRegion,
} from "./render";

const PAGE = { width: 612, height: 792 };

function contextStub() {
  const calls: string[] = [];
  const rects: [number, number, number, number][] = [];
  const context: RenderCanvasContext = {
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    beginPath: () => calls.push("beginPath"),
    rect: (x, y, width, height) => {
      calls.push("rect");
      rects.push([x, y, width, height]);
    },
    clip: () => calls.push("clip"),
  };
  return { context, calls, rects };
}

function pageStub(pageSize = PAGE) {
  const viewports: { scale: number; offsetX?: number; offsetY?: number }[] = [];
  const renders: { canvasContext: unknown; viewport: unknown; background?: string }[] = [];
  const page = {
    getViewport: (options: { scale: number; offsetX?: number; offsetY?: number }) => {
      viewports.push({ ...options });
      return { width: pageSize.width * options.scale, height: pageSize.height * options.scale };
    },
    render: (params: { canvasContext: unknown; viewport: unknown; background?: string }) => {
      renders.push(params);
      return { promise: Promise.resolve() };
    },
  };
  return { page: page as unknown as PDFPageProxy, viewports, renders };
}

describe("regionFrame", () => {
  it("fits the whole page into a same-size canvas, keeping the padding", () => {
    const frame = regionFrame(PAGE, PAGE);
    expect(frame.scale).toBeCloseTo((PAGE.width - 2 * REGION_PADDING_DEFAULT) / PAGE.width, 10);
    // The width is the limiting axis: exactly padded on the sides…
    expect(frame.offsetX).toBeCloseTo(REGION_PADDING_DEFAULT, 10);
    // …and centered with the leftover on the taller axis.
    expect(frame.offsetY).toBeCloseTo(
      REGION_PADDING_DEFAULT +
        (PAGE.height - 2 * REGION_PADDING_DEFAULT - PAGE.height * frame.scale) / 2,
      10,
    );
    expect(frame.clip.x).toBe(0);
    expect(frame.clip.width).toBe(PAGE.width);
    // The clip is the drawn page plus the padding around it.
    expect(frame.clip.y).toBeCloseTo(frame.offsetY - REGION_PADDING_DEFAULT, 10);
    expect(frame.clip.y + frame.clip.height).toBeCloseTo(
      frame.offsetY + PAGE.height * frame.scale + REGION_PADDING_DEFAULT,
      10,
    );
  });

  it("fits and centers a small region with the default padding", () => {
    const region = { x: 72, y: 100, width: 200, height: 26 };
    const target = { width: 400, height: 200 };
    const frame = regionFrame(PAGE, target, { region });
    expect(frame.scale).toBeCloseTo((400 - 2 * REGION_PADDING_DEFAULT) / 200, 10);
    const left = region.x * frame.scale + frame.offsetX;
    const top = region.y * frame.scale + frame.offsetY;
    expect(left).toBeCloseTo(REGION_PADDING_DEFAULT, 10);
    expect(top).toBeCloseTo(200 / 2 - (26 * frame.scale) / 2, 10);
    // The clip is the framed region plus the padding, horizontally centered.
    expect(frame.clip.x).toBe(0);
    expect(frame.clip.width).toBe(400);
    expect(frame.clip.y + frame.clip.height / 2).toBeCloseTo(100, 10);
    expect(frame.clip.height).toBeCloseTo(26 * frame.scale + 2 * REGION_PADDING_DEFAULT, 10);
  });

  it("keeps the region's aspect on the limiting axis and clips to the canvas", () => {
    const region = { x: 100, y: 100, width: 100, height: 400 };
    const target = { width: 300, height: 300 };
    const frame = regionFrame(PAGE, target, { region });
    expect(frame.scale).toBeCloseTo((300 - 2 * REGION_PADDING_DEFAULT) / 400, 10);
    expect(frame.clip.height).toBe(300);
    expect(frame.clip.y).toBe(0);
  });

  it("honours an explicit zoom and recenters the region", () => {
    const region = { x: 72, y: 100, width: 200, height: 26 };
    const target = { width: 400, height: 400 };
    const frame = regionFrame(PAGE, target, { region, scale: 2 });
    expect(frame.scale).toBe(2);
    const left = region.x * frame.scale + frame.offsetX;
    expect(left).toBeCloseTo(target.width / 2 - (200 * 2) / 2, 10);
  });

  it("treats a degenerate region as one point instead of dividing by zero", () => {
    const frame = regionFrame(
      PAGE,
      { width: 200, height: 200 },
      {
        region: { x: 10, y: 10, width: 0, height: 0 },
      },
    );
    expect(Number.isFinite(frame.scale)).toBe(true);
    expect(frame.scale).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    const region = { x: 33.3, y: 44.4, width: 111.1, height: 22.2 };
    expect(regionFrame(PAGE, { width: 500, height: 333 }, { region })).toEqual(
      regionFrame(PAGE, { width: 500, height: 333 }, { region }),
    );
  });
});

describe("renderPageRegion", () => {
  it("clips the context to the frame and renders with the fitted viewport", async () => {
    const { page, viewports, renders } = pageStub();
    const { context, calls, rects } = contextStub();
    const target = { width: 300, height: 400, getContext: () => context };
    const region = { x: 72, y: 100, width: 200, height: 26 };

    const task = renderPageRegion(page, target, { region });
    await task.promise;

    expect(viewports[0]).toEqual({ scale: 1 });
    expect(viewports[1]?.scale).toBeGreaterThan(0);
    expect(viewports[1]?.offsetX).toBeDefined();
    expect(rects).toHaveLength(1);
    expect(renders[0]?.background).toBe(RENDER_BACKGROUND_DEFAULT);
    expect(renders[0]?.canvasContext).toBe(context);
    expect(calls).toEqual(["save", "beginPath", "rect", "clip", "restore"]);
  });

  it("restores the context even when the render promise rejects", async () => {
    const { page } = pageStub();
    const failing = {
      getViewport: page.getViewport,
      render: () => ({ promise: Promise.reject(new Error("boom")) }),
    } as unknown as PDFPageProxy;
    const { context, calls } = contextStub();
    const target = { width: 300, height: 400, getContext: () => context };

    await expect(renderPageRegion(failing, target).promise).rejects.toThrow("boom");
    expect(calls).toContain("restore");
  });

  it("fails loudly when the target has no 2D context", () => {
    const { page } = pageStub();
    const target = { width: 300, height: 400, getContext: () => null };
    expect(() => renderPageRegion(page, target)).toThrow(RenderTargetError);
  });
});

describe("renderPageRegion against the real PDF.js", () => {
  it("draws a minipdf page into a stub context without throwing", async () => {
    const bytes = buildPdf([textStream("Hello, PagePace!", { x: 72, y: 700, size: 14 })]);
    const task = getDocument({ data: bytes, verbosity: 0 });
    const pdf: PDFDocumentProxy = await task.promise;
    try {
      const page = await pdf.getPage(1);
      const calls: string[] = [];
      const canvas = { width: 300, height: 400 };
      const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      const context = new Proxy(canvas as Record<string | symbol, unknown>, {
        get(target, property) {
          if (property === "canvas") return canvas;
          if (property === "getTransform") return () => identity;
          const value = target[property];
          if (value !== undefined) return value;
          return (...args: unknown[]) => {
            calls.push(String(property));
            void args;
          };
        },
        set(target, property, value) {
          target[property] = value;
          return true;
        },
      }) as unknown as RenderCanvasContext;
      const region = { x: 60, y: 80, width: 220, height: 40 };

      const renderTask = renderPageRegion(
        page,
        {
          width: canvas.width,
          height: canvas.height,
          getContext: () => context,
        },
        { region },
      );
      await renderTask.promise;

      expect(calls).toContain("save");
      expect(calls).toContain("clip");
      expect(calls).toContain("restore");
      expect(
        calls.some((name) => name === "fill" || name === "fillRect" || name === "drawImage"),
      ).toBe(true);
    } finally {
      await task.destroy();
    }
  });
});
