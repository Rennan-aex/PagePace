import { z } from "zod";
import type { Anchor, BlockKind, Run } from "./book";
import { anchorSchema, blockKindSchema } from "./book";
import { levelSchema, schemaVersionSchema, sha256Schema } from "./common";

/** Fields shared by every correction. */
export interface CorrectionOpBase {
  id: string;
  /** ISO-8601 with timezone. */
  createdAt: string;
  target: Anchor;
}

export type CorrectionStyle = Partial<Pick<Run, "bold" | "italic" | "sup" | "sub">>;

export type CorrectionOp = CorrectionOpBase &
  (
    | { op: "merge_with_next" }
    | { op: "split_at"; offset: number }
    | { op: "set_kind"; kind: BlockKind; level?: number }
    | { op: "delete_block" }
    | { op: "edit_text"; replacement: string }
    | {
        op: "set_style";
        start: number;
        end: number;
        style: CorrectionStyle;
      }
  );

export interface Overlay {
  schemaVersion: string;
  bookId: string;
  /** Applied in order. */
  ops: CorrectionOp[];
}

const opCommon = {
  id: z.string().min(1),
  createdAt: z.iso.datetime({ offset: true }),
  target: anchorSchema,
};

const correctionStyleSchema: z.ZodType<CorrectionStyle> = z.strictObject({
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  sup: z.boolean().optional(),
  sub: z.boolean().optional(),
});

export const correctionOpSchema: z.ZodType<CorrectionOp> = z
  .discriminatedUnion("op", [
    z.strictObject({ ...opCommon, op: z.literal("merge_with_next") }),
    z.strictObject({
      ...opCommon,
      op: z.literal("split_at"),
      offset: z.number().int().min(0),
    }),
    z.strictObject({
      ...opCommon,
      op: z.literal("set_kind"),
      kind: blockKindSchema,
      level: levelSchema.optional(),
    }),
    z.strictObject({ ...opCommon, op: z.literal("delete_block") }),
    z.strictObject({
      ...opCommon,
      op: z.literal("edit_text"),
      replacement: z.string(),
    }),
    z.strictObject({
      ...opCommon,
      op: z.literal("set_style"),
      start: z.number().int().min(0),
      end: z.number().int().min(0),
      style: correctionStyleSchema,
    }),
  ])
  .superRefine((value, ctx) => {
    if (value.op === "set_kind" && value.kind === "heading" && value.level === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["level"],
        message: "`level` (1..6) is required when `kind` is heading",
      });
    }
    if (value.op === "set_style") {
      if (value.end < value.start) {
        ctx.addIssue({
          code: "custom",
          path: ["end"],
          message: "`end` must be greater than or equal to `start`",
        });
      }
      if (Object.values(value.style).every((flag) => flag === undefined)) {
        ctx.addIssue({
          code: "custom",
          path: ["style"],
          message: "`style` needs at least one flag (bold, italic, sup or sub)",
        });
      }
    }
  });

export const overlaySchema: z.ZodType<Overlay> = z.strictObject({
  schemaVersion: schemaVersionSchema,
  bookId: sha256Schema,
  ops: z.array(correctionOpSchema),
});
