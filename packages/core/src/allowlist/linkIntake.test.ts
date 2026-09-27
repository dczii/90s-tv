import { describe, expect, it } from "vitest";
import type { AllowlistError } from "./types.js";
import {
  LINK_INPUT_MAX_CHARS,
  canonicalYoutubeUrl,
  extractYoutubeLink,
  linkErrorMessage,
  parseLinkInput,
} from "./linkIntake.js";

describe("extractYoutubeLink", () => {
  it("pulls the link out of share-sheet text", () => {
    expect(
      extractYoutubeLink("Watch this! https://youtu.be/dQw4w9WgXcQ?si=abc so fun"),
    ).toBe("https://youtu.be/dQw4w9WgXcQ?si=abc");
  });

  it("finds scheme-less links", () => {
    expect(extractYoutubeLink("see www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });

  it("returns trimmed input when no YouTube link is present", () => {
    expect(extractYoutubeLink("  https://vimeo.com/1  ")).toBe(
      "https://vimeo.com/1",
    );
  });
});

describe("parseLinkInput", () => {
  it("accepts a video inside surrounding text", () => {
    expect(parseLinkInput("hi https://youtu.be/dQw4w9WgXcQ")).toEqual({
      ok: true,
      value: { id: "dQw4w9WgXcQ", kind: "Video" },
    });
  });

  it("accepts a playlist", () => {
    expect(
      parseLinkInput("https://www.youtube.com/playlist?list=PLtest123"),
    ).toEqual({ ok: true, value: { id: "PLtest123", kind: "Playlist" } });
  });

  it("rejects empty input with Empty", () => {
    const r = parseLinkInput("   ");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("Empty");
      expect(r.message).toMatch(/Paste/);
    }
  });

  it("rejects channel links with a clear message", () => {
    const r = parseLinkInput("https://www.youtube.com/@SomeChannel");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("UnsupportedHost");
      expect(r.message).toMatch(/Channel/);
    }
  });

  it("rejects other hosts", () => {
    const r = parseLinkInput("https://vimeo.com/123");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("UnsupportedHost");
  });

  it("only reads the first LINK_INPUT_MAX_CHARS characters", () => {
    const padded = `${" ".repeat(LINK_INPUT_MAX_CHARS)}https://youtu.be/dQw4w9WgXcQ`;
    expect(parseLinkInput(padded).ok).toBe(false);
  });
});

describe("linkErrorMessage", () => {
  it("has copy for every error kind", () => {
    const errors: AllowlistError[] = [
      { kind: "Empty" },
      { kind: "MalformedUrl", input: "x" },
      { kind: "UnsupportedHost", input: "x" },
      { kind: "NotEmbeddable", videoId: "x" },
      { kind: "PrivateBlocked", videoId: "x" },
      { kind: "AgeRestricted", videoId: "x" },
      { kind: "RegionRestricted", videoId: "x" },
      { kind: "Removed", videoId: "x" },
      { kind: "NoPlayableItem" },
    ];
    for (const e of errors) expect(linkErrorMessage(e).length).toBeGreaterThan(0);
  });
});

describe("canonicalYoutubeUrl", () => {
  it("builds watch and playlist URLs", () => {
    expect(canonicalYoutubeUrl({ id: "dQw4w9WgXcQ", kind: "Video" })).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(canonicalYoutubeUrl({ id: "PLx", kind: "Playlist" })).toBe(
      "https://www.youtube.com/playlist?list=PLx",
    );
  });
});
