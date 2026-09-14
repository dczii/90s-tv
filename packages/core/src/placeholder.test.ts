import { describe, expect, it } from "vitest";
import { PRODUCT_NAME } from "./index.js";

describe("@nostalgiabox/core", () => {
  it("is a node-testable package", () => {
    expect(true).toBe(true);
    expect(PRODUCT_NAME).toBe("Timed YouTube TV");
  });
});
