import { describe, expect, it } from "vitest";
import { SKIP_IFRAME_ERROR_CODES } from "./PlayerSession";

describe("SKIP_IFRAME_ERROR_CODES", () => {
  it("includes 2/5/100/101/150 and not 105", () => {
    expect(SKIP_IFRAME_ERROR_CODES.has(2)).toBe(true);
    expect(SKIP_IFRAME_ERROR_CODES.has(5)).toBe(true);
    expect(SKIP_IFRAME_ERROR_CODES.has(100)).toBe(true);
    expect(SKIP_IFRAME_ERROR_CODES.has(101)).toBe(true);
    expect(SKIP_IFRAME_ERROR_CODES.has(150)).toBe(true);
    expect(SKIP_IFRAME_ERROR_CODES.has(105)).toBe(false);
  });
});

/**
 * Generation gate logic mirrored from usePlayerSession (pure for Node tests).
 */
function acceptEvent(
  expected: number | null,
  eventGen: number,
): "ok" | "stale" | "seed" {
  if (expected == null) return "seed";
  return expected === eventGen ? "ok" : "stale";
}

describe("PlayerSession generation gate", () => {
  it("seeds on first event then drops stale", () => {
    expect(acceptEvent(null, 3)).toBe("seed");
    expect(acceptEvent(3, 3)).toBe("ok");
    expect(acceptEvent(3, 4)).toBe("stale");
  });
});
