import { describe, it, expect } from "vitest";
import { PACKAGE_NAME } from "./index";

describe("@pagepace/eval", () => {
  it("loads (smoke test; replace as the package grows)", () => {
    expect(PACKAGE_NAME).toBe("@pagepace/eval");
  });
});
