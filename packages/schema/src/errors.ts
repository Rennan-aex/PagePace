import type { z } from "zod";

/** One validation problem: where (path) and why (message). */
export interface SchemaIssue {
  path: string[];
  message: string;
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; issues: SchemaIssue[] };

/** Thrown by `parse*` helpers. Carries every issue, not only the first one. */
export class SchemaValidationError extends Error {
  readonly subject: string;
  readonly issues: readonly SchemaIssue[];

  constructor(subject: string, issues: readonly SchemaIssue[]) {
    super(`${subject} is not a valid ${schemaIssueSummary(issues)}`);
    this.name = "SchemaValidationError";
    this.subject = subject;
    this.issues = issues;
  }
}

function schemaIssueSummary(issues: readonly SchemaIssue[]): string {
  const shown = issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
  const more = issues.length > shown.length ? ` (+${issues.length - shown.length} more)` : "";
  return `${shown.join("; ")}${more}`;
}

/** Validates without throwing. Use this in the app; use `parseWith` in the CLI/tests. */
export function safeParseWith<T>(schema: z.ZodType<T>, input: unknown): ParseResult<T> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return {
    ok: false,
    issues: result.error.issues.flatMap((issue) => {
      const path = issue.path.map((segment) => String(segment));
      // zod reports every unknown key as one root-level issue; split it so each
      // key gets its own path (e.g. ["structTree"]) for nicer messages.
      if (issue.code === "unrecognized_keys") {
        return issue.keys.map((key) => ({ path: [...path, key], message: issue.message }));
      }
      return [{ path, message: issue.message }];
    }),
  };
}

/** Validates and throws `SchemaValidationError` when the input is not valid. */
export function parseWith<T>(schema: z.ZodType<T>, input: unknown, subject: string): T {
  const result = safeParseWith(schema, input);
  if (!result.ok) {
    throw new SchemaValidationError(subject, result.issues);
  }
  return result.data;
}
