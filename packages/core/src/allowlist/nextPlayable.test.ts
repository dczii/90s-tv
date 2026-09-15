import { describe, expect, it } from "vitest";
import {
  cursorFromExpanded,
  nextPlayable,
  type ExpandedVideoId,
} from "./nextPlayable.js";

const A: ExpandedVideoId[] = [
  { entryId: "pl1", index: 0, videoId: "v0" },
  { entryId: "pl1", index: 1, videoId: "v1" },
  { entryId: "pl1", index: 2, videoId: "v2" },
  { entryId: "vidX", index: 0, videoId: "vx" },
];

describe("nextPlayable", () => {
  it("returns first when cursor is null", () => {
    expect(nextPlayable(A, null)?.videoId).toBe("v0");
  });

  it("returns null for empty expansion", () => {
    expect(nextPlayable([], null)).toBeNull();
  });

  it("starts at or after cursor by default", () => {
    expect(
      nextPlayable(A, { entryId: "pl1", index: 1 })?.videoId,
    ).toBe("v1");
  });

  it("startAfter skips the cursor position", () => {
    expect(
      nextPlayable(A, { entryId: "pl1", index: 1 }, new Set(), true)?.videoId,
    ).toBe("v2");
  });

  it("skips definitive skip ids", () => {
    const skips = new Set(["v0", "v1"]);
    expect(nextPlayable(A, null, skips)?.videoId).toBe("v2");
  });

  it("returns null when every remaining id is skipped", () => {
    const skips = new Set(["v0", "v1", "v2", "vx"]);
    expect(nextPlayable(A, null, skips)).toBeNull();
  });

  it("walks across entry boundaries", () => {
    expect(
      nextPlayable(A, { entryId: "pl1", index: 2 }, new Set(), true)?.videoId,
    ).toBe("vx");
  });

  it("restarts when cursor entry is gone", () => {
    expect(
      nextPlayable(A, { entryId: "gone", index: 0 })?.videoId,
    ).toBe("v0");
  });

  it("cursorFromExpanded mirrors fields", () => {
    expect(cursorFromExpanded(A[2]!)).toEqual({
      entryId: "pl1",
      index: 2,
    });
  });
});
