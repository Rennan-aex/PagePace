import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@pagepace/schema": p("./packages/schema/src/index.ts"),
      "@pagepace/extractor": p("./packages/extractor/src/index.ts"),
      "@pagepace/segmenter": p("./packages/segmenter/src/index.ts"),
      "@pagepace/eval": p("./packages/eval/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "packages/*/test/**/*.test.ts"],
    passWithNoTests: false,
  },
});
