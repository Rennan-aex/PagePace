import { z } from "zod";
import { SCHEMA_VERSION } from "./version";

/** The `schemaVersion` of every document produced from now on. */
export const schemaVersionSchema = z.literal(SCHEMA_VERSION);

/** Lower/upper case hex, exactly 64 characters. */
export const sha256Schema = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, "must be a sha-256 hex digest (64 hex chars)");

/** 0-based page index. */
export const pageIndexSchema = z.number().int().min(0);

/** Confidence between 0 and 1. */
export const confidenceSchema = z.number().min(0).max(1);

/**
 * Box in PDF page coordinates, origin at the top-left corner, in points.
 * Used by blocks, tag hints and non-text regions.
 */
export const bboxSchema = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().min(0),
  height: z.number().finite().min(0),
});

export type BBox = z.infer<typeof bboxSchema>;

/** Heading levels 1..6 (SCHEMA.md §2). */
export const levelSchema = z.number().int().min(1).max(6);
