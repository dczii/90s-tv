import { describe, expect, it } from "vitest";
import type { ExpandedVideoId } from "@littleplay/core";
import {
  channelsFromEntries,
  formatChannelNumber,
  nextInChannel,
  resumeInChannel,
  stepChannel,
} from "./channels";

const shows = [
  { id: "bear", title: "Little Bear", thumbnailUrl: null },
  { id: "franklin", title: "Franklin", thumbnailUrl: null },
  { id: "blue", title: "Bear in the Big Blue House", thumbnailUrl: null },
];

const expanded: ExpandedVideoId[] = [
  { entryId: "bear", index: 0, videoId: "b0" },
  { entryId: "bear", index: 1, videoId: "b1" },
  { entryId: "franklin", index: 0, videoId: "f0" },
  { entryId: "franklin", index: 1, videoId: "f1" },
];

describe("channelsFromEntries", () => {
  it("numbers selected shows from 1 in save order", () => {
    expect(channelsFromEntries(shows).map((c) => [c.number, c.entryId])).toEqual([
      [1, "bear"],
      [2, "franklin"],
      [3, "blue"],
    ]);
    expect(formatChannelNumber(2)).toBe("02");
  });
});

describe("stepChannel", () => {
  const channels = channelsFromEntries(shows);

  it("wraps forward and backward", () => {
    expect(stepChannel(channels, "blue", 1)?.entryId).toBe("bear");
    expect(stepChannel(channels, "bear", -1)?.entryId).toBe("blue");
  });

  it("lands on an end when the current show is gone", () => {
    expect(stepChannel(channels, "missing", 1)?.entryId).toBe("bear");
    expect(stepChannel(channels, null, -1)?.entryId).toBe("blue");
  });
});

describe("nextInChannel", () => {
  it("starts at the first playable video on that channel", () => {
    expect(nextInChannel(expanded, "franklin", null)?.videoId).toBe("f0");
  });

  it("wraps inside the channel when the last video ends", () => {
    expect(
      nextInChannel(
        expanded,
        "bear",
        { entryId: "bear", index: 1 },
        new Set(),
        true,
      )?.videoId,
    ).toBe("b0");
  });

  it("does not walk into the next show", () => {
    expect(
      nextInChannel(
        expanded,
        "bear",
        { entryId: "bear", index: 0 },
        new Set(),
        true,
      )?.videoId,
    ).toBe("b1");
  });

  it("returns null when every video on the channel is skipped", () => {
    expect(
      nextInChannel(expanded, "franklin", null, new Set(["f0", "f1"])),
    ).toBeNull();
  });
});

describe("resumeInChannel", () => {
  it("stays on the cursor channel", () => {
    expect(
      resumeInChannel(expanded, { entryId: "franklin", index: 1 })?.videoId,
    ).toBe("f1");
  });

  it("falls back to the first channel when the cursor show was removed", () => {
    expect(
      resumeInChannel(expanded, { entryId: "gone", index: 0 })?.videoId,
    ).toBe("b0");
  });
});
