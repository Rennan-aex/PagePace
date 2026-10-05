import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index";

describe("@pagepace/cli", () => {
  it("loads (smoke test; replace as the package grows)", () => {
    expect(PACKAGE_NAME).toBe("@pagepace/cli");
  });
});
