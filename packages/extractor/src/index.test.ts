import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index";

describe("@pagepace/extractor", () => {
  it("loads (smoke test; replace as the package grows)", () => {
    expect(PACKAGE_NAME).toBe("@pagepace/extractor");
  });
});
