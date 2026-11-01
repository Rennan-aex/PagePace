/**
 * Visual style heuristic (E9-T03): bold, italic and font size estimated from
 * the rendered page image — the signal a scanned page never carries in a
 * digital text layer.
 *
 * Inputs are pure data: the page as a grayscale raster ({@link OcrRaster},
 * one luminance sample per pixel, 0 = black ink, 255 = white paper) and the
 * engine word boxes in image pixels (the `OcrWord` layout). The caller decodes
 * the PNG; this module never touches a canvas, a worker or the file system
 * (rule 6), so the same page always yields the same style (rule 7).
 *
 * Every threshold is relative to the page, never an absolute pixel value:
 * - **bold** — the median stroke width (distance transform of the ink: how
 *   far each ink pixel sits from the paper) divided by the page median. The
 *   page median is the "regular" reference; a ratio above
 *   {@link OCR_BOLD_STROKE_RATIO} is heavy enough to be bold;
 * - **italic** — a virtual shear of the word box at candidate angles. An
 *   italic word snaps back to upright and its column projection concentrates
 *   (projection profile), so the angle of the strongest peak inside the
 *   italic band plus the margin over the runner-up decide;
 * - **font size** — the x-height band (contiguous rows whose ink density is
 *   above {@link OCR_X_HEIGHT_ROW_SHARE} of the peak row) divided by
 *   {@link OCR_X_HEIGHT_RATIO}: the x-height is a stable fraction of the
 *   face, so "sun" (pure x-height) and "Hello" (with ascenders) come out at
 *   the same size, where the E9-T02 box height wobbled word by word. A word
 *   too thin to measure keeps the box height.
 *
 * Fallback (the task's "no style, low confidence"): a word with too little
 * ink, too little contrast or no page reference comes back with no flags and
 * zero confidence — the caller keeps the plain E9-T02 item unchanged.
 */

/** One page as grayscale pixels: `luminance[y * width + x]`, 0 = black, 255 = white. */
export interface OcrRaster {
  width: number;
  height: number;
  luminance: Uint8Array;
}

/** The word facts the heuristic reads (structural — `OcrWord` satisfies it). */
export interface StyleWordInput {
  bbox: { x0: number; y0: number; x1: number; y1: number };
  /** Engine confidence 0–100; below {@link OCR_STYLE_MIN_ENGINE_CONFIDENCE} the word keeps no style. */
  confidence: number;
}

/** Estimated style of one word; absent fields mean "not measurable, keep plain". */
export interface OcrWordStyle {
  /** Page-calibrated font size from the x-height band; absent when unmeasurable. */
  fontSize?: number;
  /** Stroke heavier than the page regular reference; absent when unmeasurable. */
  bold?: boolean;
  /** Shear inside the italic band; absent when unmeasurable. */
  italic?: boolean;
  /** 0–1 support for the flags above; 0 when nothing was measurable. */
  styleConfidence: number;
}

/** Minimum ink/paper luminance contrast for a word to be measured at all. */
export const OCR_STYLE_MIN_CONTRAST = 40;

/** Ink pixels a word box must hold before stroke/skew/x-height are measured. */
export const OCR_STYLE_MIN_INK = 24;

/** Measured words a page needs before the regular reference (median) exists. */
export const OCR_STYLE_MIN_MEASURED_WORDS = 2;

/** Engine word confidence (0–100) at and above which the image may set style. */
export const OCR_STYLE_MIN_ENGINE_CONFIDENCE = 40;

/** Stroke/page-median ratio at and above which a word is called bold. */
export const OCR_BOLD_STROKE_RATIO = 1.4;

/** Shear peak (best/median projection energy) at and above which italic holds. */
export const OCR_ITALIC_PEAK_RATIO = 1.15;

/** Shear angles (degrees) an italic slant shows; outside → never italic. */
export const OCR_ITALIC_MIN_SKEW_DEG = 5;
export const OCR_ITALIC_MAX_SKEW_DEG = 25;

/** Confidence floor for the caller to write flags onto the item (E9-T03). */
export const OCR_STYLE_MIN_CONFIDENCE = 0.5;

/** Row ink density (share of the peak row) that still counts as the x-height band. */
export const OCR_X_HEIGHT_ROW_SHARE = 0.35;

/** x-height as a share of the font size for serif body faces (~0.45–0.5). */
export const OCR_X_HEIGHT_RATIO = 0.5;

/** Candidate shear grid: degrees from −max to +max in 1° steps (deterministic). */
const SKEW_STEP_DEG = 1;

/** One word's raw measurements; `null` when the word was not measurable. */
interface WordMeasurement {
  /** Median stroke width in pixels (twice the median ink-to-paper distance). */
  stroke: number;
  /** Shear angle (degrees) that concentrates the column projection most. */
  skewDeg: number;
  /** Projection energy of the best angle over the median angle's. */
  peakRatio: number;
  /** Height of the densest contiguous row band, in pixels. */
  xHeight: number;
}

function clampInt(value: number, min: number, max: number): number {
  const rounded = Math.round(value);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * Median stroke width of one box: for every ink pixel, the distance to the
 * nearest paper pixel (the distance transform), then twice the median — the
 * classic stroke-width estimate, orientation-independent by construction (a
 * horizontal sweep would fatten every italic stem). Neighbours outside the
 * measured box count as paper: the engine boxes already pad the glyphs, and
 * treating the border consistently keeps the bias the same for every word.
 */
function medianStroke(
  luminance: Uint8Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  inkThreshold: number,
): number {
  const radii: number[] = [];
  const maxRadius = Math.ceil((y1 - y0) / 2) + 1;
  for (let y = y0; y < y1; y += 1) {
    const row = y * width;
    for (let x = x0; x < x1; x += 1) {
      if ((luminance[row + x] as number) > inkThreshold) continue;
      let radius = maxRadius;
      outer: for (let ring = 1; ring <= maxRadius; ring += 1) {
        const nx0 = x - ring;
        const nx1 = x + ring;
        const ny0 = y - ring;
        const ny1 = y + ring;
        for (let ny = ny0; ny <= ny1; ny += 1) {
          for (let nx = nx0; nx <= nx1; nx += 1) {
            if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1) {
              radius = ring;
              break outer;
            }
            if ((luminance[ny * width + nx] as number) > inkThreshold) {
              radius = ring;
              break outer;
            }
          }
        }
      }
      radii.push(Math.max(1, radius));
    }
  }
  if (radii.length === 0) return 0;
  return 2 * median(radii);
}

/**
 * Shear probing (projection profile): virtual-shear the box at each candidate
 * angle and sum the ink per destination column. The angle whose projection
 * concentrates the most (`sum of squares`, constant total ink) is the slant:
 * 0 for upright text, ~8–18° for italics, which snap back to vertical. The
 * margin is measured against the median angle's score, never the runner-up:
 * one degree away the score barely moves, so a neighbour says nothing.
 */
function shearProfile(
  luminance: Uint8Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  inkThreshold: number,
): { skewDeg: number; peakRatio: number } {
  const ink: number[] = [];
  for (let y = y0; y < y1; y += 1) {
    const row = y * width;
    for (let x = x0; x < x1; x += 1) {
      if ((luminance[row + x] as number) <= inkThreshold) ink.push(y * width + x);
    }
  }
  const height = y1 - y0;
  const center = (y0 + y1 - 1) / 2;
  const margin = Math.ceil((height / 2) * Math.tan((OCR_ITALIC_MAX_SKEW_DEG * Math.PI) / 180)) + 2;
  const span = width + 2 * margin;
  const projection = new Float64Array(span);
  const scores: number[] = [];
  let bestAngle = 0;
  let bestScore = -1;
  for (
    let angle = -OCR_ITALIC_MAX_SKEW_DEG;
    angle <= OCR_ITALIC_MAX_SKEW_DEG;
    angle += SKEW_STEP_DEG
  ) {
    projection.fill(0);
    const tan = Math.tan((angle * Math.PI) / 180);
    for (const cell of ink) {
      const y = Math.floor(cell / width);
      const x = cell - y * width;
      const column = clampInt(x + margin + (y - center) * tan, 0, span - 1);
      projection[column] = (projection[column] as number) + 1;
    }
    let score = 0;
    for (let column = 0; column < span; column += 1) {
      const value = projection[column] as number;
      score += value * value;
    }
    scores.push(score);
    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }
  const peakRatio = median(scores) > 0 ? bestScore / (median(scores) as number) : 1;
  return { skewDeg: bestAngle, peakRatio };
}

/** Height of the densest contiguous band of rows (the x-height band). */
function xHeightBand(
  luminance: Uint8Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  inkThreshold: number,
): number {
  const counts: number[] = [];
  let peak = 0;
  for (let y = y0; y < y1; y += 1) {
    const row = y * width;
    let count = 0;
    for (let x = x0; x < x1; x += 1) {
      if ((luminance[row + x] as number) <= inkThreshold) count += 1;
    }
    counts.push(count);
    if (count > peak) peak = count;
  }
  if (peak === 0) return 0;
  const floor = peak * OCR_X_HEIGHT_ROW_SHARE;
  let best = 0;
  let run = 0;
  for (const count of counts) {
    if (count >= floor) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

/** All raw measurements of one word box; `null` when contrast/ink are too thin. */
function measureWord(raster: OcrRaster, bbox: StyleWordInput["bbox"]): WordMeasurement | null {
  const x0 = clampInt(bbox.x0, 0, raster.width - 1);
  const y0 = clampInt(bbox.y0, 0, raster.height - 1);
  const x1 = clampInt(bbox.x1, x0 + 1, raster.width);
  const y1 = clampInt(bbox.y1, y0 + 1, raster.height);
  if (x1 - x0 < 3 || y1 - y0 < 3) return null;
  let paper = 0;
  let dark = 255;
  for (let y = y0; y < y1; y += 1) {
    const row = y * raster.width;
    for (let x = x0; x < x1; x += 1) {
      const value = raster.luminance[row + x] as number;
      if (value > paper) paper = value;
      if (value < dark) dark = value;
    }
  }
  const contrast = paper - dark;
  if (contrast < OCR_STYLE_MIN_CONTRAST) return null;
  const inkThreshold = paper - Math.max(OCR_STYLE_MIN_CONTRAST, contrast / 2);
  let ink = 0;
  for (let y = y0; y < y1; y += 1) {
    const row = y * raster.width;
    for (let x = x0; x < x1; x += 1) {
      if ((raster.luminance[row + x] as number) <= inkThreshold) ink += 1;
    }
  }
  if (ink < OCR_STYLE_MIN_INK) return null;
  const stroke = medianStroke(raster.luminance, raster.width, x0, y0, x1, y1, inkThreshold);
  if (!(stroke > 0)) return null;
  const { skewDeg, peakRatio } = shearProfile(
    raster.luminance,
    raster.width,
    x0,
    y0,
    x1,
    y1,
    inkThreshold,
  );
  const xHeight = xHeightBand(raster.luminance, raster.width, x0, y0, x1, y1, inkThreshold);
  if (xHeight <= 0) return null;
  return { stroke, skewDeg, peakRatio, xHeight };
}

/**
 * Estimated style of every word of one page, in the order of `words` (the
 * same flat order {@link ocrPageToRawPage} walks). Words the engine already
 * scored low keep no style — the engine's own doubt outranks the image.
 */
export function estimatePageWordStyles(
  raster: OcrRaster,
  words: readonly StyleWordInput[],
): OcrWordStyle[] {
  const measurements = words.map((word) => measureWord(raster, word.bbox));
  const measured = measurements.filter((value): value is WordMeasurement => value !== null);
  if (measured.length < OCR_STYLE_MIN_MEASURED_WORDS) {
    return words.map(() => ({ styleConfidence: 0 }));
  }
  const regularStroke = median(measured.map((value) => value.stroke));
  if (!(regularStroke > 0)) {
    return words.map(() => ({ styleConfidence: 0 }));
  }
  return words.map((word, index) => {
    const measurement = measurements[index];
    if (
      measurement === undefined ||
      measurement === null ||
      word.confidence < OCR_STYLE_MIN_ENGINE_CONFIDENCE
    ) {
      return { styleConfidence: 0 };
    }
    const ratio = measurement.stroke / regularStroke;
    const bold = ratio >= OCR_BOLD_STROKE_RATIO;
    const boldConfidence = Math.min(1, Math.abs(ratio - 1) / (OCR_BOLD_STROKE_RATIO - 1));
    const inBand =
      measurement.skewDeg >= OCR_ITALIC_MIN_SKEW_DEG &&
      measurement.skewDeg <= OCR_ITALIC_MAX_SKEW_DEG;
    const italic = inBand && measurement.peakRatio >= OCR_ITALIC_PEAK_RATIO;
    const italicConfidence = inBand
      ? Math.min(1, (measurement.peakRatio - 1) / (OCR_ITALIC_PEAK_RATIO - 1))
      : 1;
    // Size: the x-height is a stable fraction of the face; the box height is
    // only the fallback of a word too thin to measure.
    return {
      fontSize: measurement.xHeight / OCR_X_HEIGHT_RATIO,
      bold,
      italic,
      styleConfidence: Math.max(boldConfidence, italicConfidence),
    };
  });
}
