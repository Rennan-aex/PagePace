// E7-T01 — the block confidence model: every doubt flag a block carries
// lowers its confidence by a fixed weight from CONFIDENCE_FLAG_WEIGHTS. The
// weights add up, so two independent doubts lower it more than either one
// alone; structural flags carry no weight. The same functions keep the
// historical single-flag values (0.7 / 0.3) as the guard below proves, and
// a block is never reported below MIN_BLOCK_CONFIDENCE.
import { describe, expect, it } from "vitest";
import { BROKEN_FONT_CONFIDENCE, BROKEN_FONT_MAPPING } from "./brokenfont";
import { CAPTION_UNCERTAIN_CONFIDENCE, UNCERTAIN_CAPTION_FLAG } from "./captions";
import {
  BOOK_BLOCK_CONFIDENCE,
  blockConfidence,
  CONFIDENCE_FLAG_WEIGHTS,
  MIN_BLOCK_CONFIDENCE,
  OCR_TEXT_LAYER_CONFIDENCE,
} from "./confidence";
import { FOOTNOTE_UNCERTAIN_CONFIDENCE, UNCERTAIN_FOOTNOTE_FLAG } from "./footnotes";
import { HYPHEN_UNCERTAIN_CONFIDENCE, UNCERTAIN_HYPHEN_FLAG } from "./hyphen";
import { LIST_UNCERTAIN_CONFIDENCE, UNCERTAIN_LIST_FLAG } from "./lists";
import {
  CALL_WITHOUT_NOTE_FLAG,
  NOTE_LINK_UNCERTAIN_CONFIDENCE,
  NOTE_WITHOUT_CALL_FLAG,
} from "./notelinks";
import { QUOTE_UNCERTAIN_CONFIDENCE, UNCERTAIN_QUOTE_FLAG } from "./quotes";
import { SIDEBAR_FLAG } from "./sidebars";

describe("block confidence model (E7-T01)", () => {
  it("keeps the digital base at 0.9 and the OCR base below it", () => {
    expect(BOOK_BLOCK_CONFIDENCE).toBe(0.9);
    expect(OCR_TEXT_LAYER_CONFIDENCE).toBe(0.5);
  });

  it("gives a block with no flag the full base confidence", () => {
    expect(blockConfidence(BOOK_BLOCK_CONFIDENCE, [])).toBe(BOOK_BLOCK_CONFIDENCE);
    expect(blockConfidence(OCR_TEXT_LAYER_CONFIDENCE, [])).toBe(OCR_TEXT_LAYER_CONFIDENCE);
  });

  it("keeps the historical single-flag values on a digital base (weight = base − value)", () => {
    expect(blockConfidence(BOOK_BLOCK_CONFIDENCE, [UNCERTAIN_HYPHEN_FLAG])).toBe(
      HYPHEN_UNCERTAIN_CONFIDENCE,
    );
    expect(blockConfidence(BOOK_BLOCK_CONFIDENCE, [UNCERTAIN_FOOTNOTE_FLAG])).toBe(
      FOOTNOTE_UNCERTAIN_CONFIDENCE,
    );
    expect(blockConfidence(BOOK_BLOCK_CONFIDENCE, [UNCERTAIN_QUOTE_FLAG])).toBe(
      QUOTE_UNCERTAIN_CONFIDENCE,
    );
    expect(blockConfidence(BOOK_BLOCK_CONFIDENCE, [UNCERTAIN_LIST_FLAG])).toBe(
      LIST_UNCERTAIN_CONFIDENCE,
    );
    expect(blockConfidence(BOOK_BLOCK_CONFIDENCE, [UNCERTAIN_CAPTION_FLAG])).toBe(
      CAPTION_UNCERTAIN_CONFIDENCE,
    );
    expect(blockConfidence(BOOK_BLOCK_CONFIDENCE, [NOTE_WITHOUT_CALL_FLAG])).toBe(
      NOTE_LINK_UNCERTAIN_CONFIDENCE,
    );
    expect(blockConfidence(BOOK_BLOCK_CONFIDENCE, [CALL_WITHOUT_NOTE_FLAG])).toBe(
      NOTE_LINK_UNCERTAIN_CONFIDENCE,
    );
    expect(blockConfidence(BOOK_BLOCK_CONFIDENCE, [BROKEN_FONT_MAPPING])).toBe(
      BROKEN_FONT_CONFIDENCE,
    );
  });

  it("adds the weights up so two doubts lower the block further (E7-T01)", () => {
    // 0.9 − 0.2 (hyphen) − 0.2 (footnote) = 0.5 — the old Math.min stopped at 0.7.
    expect(
      blockConfidence(BOOK_BLOCK_CONFIDENCE, [UNCERTAIN_HYPHEN_FLAG, UNCERTAIN_FOOTNOTE_FLAG]),
    ).toBe(0.5);
    expect(
      blockConfidence(BOOK_BLOCK_CONFIDENCE, [BROKEN_FONT_MAPPING, UNCERTAIN_HYPHEN_FLAG]),
    ).toBe(0.1);
  });

  it("subtracts the weights from an OCR base too (a doubt never raises confidence)", () => {
    // 0.5 − 0.2 = 0.3 — the old Math.min kept the OCR base untouched.
    expect(blockConfidence(OCR_TEXT_LAYER_CONFIDENCE, [UNCERTAIN_HYPHEN_FLAG])).toBe(0.3);
    // 0.5 − 0.6 would be negative: the floor holds.
    expect(blockConfidence(OCR_TEXT_LAYER_CONFIDENCE, [BROKEN_FONT_MAPPING])).toBe(
      MIN_BLOCK_CONFIDENCE,
    );
  });

  it("floors every combination at the minimum block confidence", () => {
    expect(
      blockConfidence(BOOK_BLOCK_CONFIDENCE, [
        BROKEN_FONT_MAPPING,
        UNCERTAIN_HYPHEN_FLAG,
        UNCERTAIN_FOOTNOTE_FLAG,
      ]),
    ).toBe(MIN_BLOCK_CONFIDENCE);
    expect(MIN_BLOCK_CONFIDENCE).toBeGreaterThan(0);
    expect(MIN_BLOCK_CONFIDENCE).toBeLessThan(BROKEN_FONT_CONFIDENCE);
  });

  it("weights structural flags at zero (a fact of layout, not a doubt)", () => {
    expect(CONFIDENCE_FLAG_WEIGHTS[SIDEBAR_FLAG] ?? 0).toBe(0);
    expect(blockConfidence(BOOK_BLOCK_CONFIDENCE, [SIDEBAR_FLAG])).toBe(BOOK_BLOCK_CONFIDENCE);
  });

  it("ignores an unknown flag instead of guessing", () => {
    expect(blockConfidence(BOOK_BLOCK_CONFIDENCE, ["never-seen-before"])).toBe(
      BOOK_BLOCK_CONFIDENCE,
    );
  });

  it("counts a repeated flag once", () => {
    expect(
      blockConfidence(BOOK_BLOCK_CONFIDENCE, [UNCERTAIN_HYPHEN_FLAG, UNCERTAIN_HYPHEN_FLAG]),
    ).toBe(HYPHEN_UNCERTAIN_CONFIDENCE);
  });

  it("is deterministic: the same base and flags always give the same number", () => {
    const flags = [BROKEN_FONT_MAPPING, UNCERTAIN_HYPHEN_FLAG, SIDEBAR_FLAG];
    const first = blockConfidence(BOOK_BLOCK_CONFIDENCE, flags);
    for (let run = 0; run < 5; run++) {
      expect(blockConfidence(BOOK_BLOCK_CONFIDENCE, [...flags].reverse())).toBe(first);
    }
  });
});
