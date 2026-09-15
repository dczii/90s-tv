import { describe, expect, it } from "vitest";
import { ENFORCEMENT_NOTE, PRODUCT_NAME } from "./product.js";

describe("@littleplay/core", () => {
  it("exports product identity and YT-D7 enforcement copy", () => {
    expect(PRODUCT_NAME).toBe("LittlePlay");
    expect(ENFORCEMENT_NOTE).toContain("cannot block the YouTube app");
  });
});
