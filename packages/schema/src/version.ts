export const PACKAGE_NAME = "@pagepace/schema";

/**
 * Contract version. Bump per the rules in docs/extractor/SCHEMA.md:
 * PATCH = docs only, MINOR = optional field/new block kind, MAJOR = breaking.
 */
export const SCHEMA_VERSION = "1.2.0";

/** Known `Book.extraction.warnings` codes (ADR-019). Unknown codes are accepted by the validator but should be listed here when they are introduced. */
export const KNOWN_WARNING_CODES = ["ocr-text-layer"] as const;

export type KnownWarningCode = (typeof KNOWN_WARNING_CODES)[number];
