import { join } from "node:path";
import { GlobalFonts } from "@napi-rs/canvas";

/**
 * Source Serif 4 for the OCR canvas fixtures — registered explicitly instead
 * of the generic `serif` family (ADR-099). The CI runner image (Ubuntu 26.04
 * `20261101`, 2026-11-02) resolves `serif` to nothing while listing the
 * installed families, so `fillText` drew blank pages and the OCR tests saw
 * zero lines; registering these bundled faces gives the same pixels on every
 * OS. License: SIL OFL 1.1 — `fonts/LICENSE-SourceSerif4.md` (Adobe, with
 * Reserved Font Name "Source"; the files are unmodified).
 */
export const TEST_SERIF = "Source Serif 4";

const FONTS_DIR = join(import.meta.dirname, "fonts");
const FACES = ["SourceSerif4-Regular.otf", "SourceSerif4-Bold.otf", "SourceSerif4-It.otf"];

let registered = false;

/** Registers the three bundled faces once per process; call before drawing. */
export function registerTestSerif(): void {
  if (registered) return;
  for (const face of FACES) GlobalFonts.registerFromPath(join(FONTS_DIR, face));
  registered = true;
}
