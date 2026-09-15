import { describe, expect, it } from "vitest";
import { parseYoutubeUrl } from "./youtubeUrlParser.js";
import { mergeAllowlist, isAllowlistEmpty } from "./types.js";
import { classifyVideoProbe, noPlayableItem } from "./playability.js";
import type { AllowlistEntry } from "./types.js";

describe("parseYoutubeUrl (YT-D17)", () => {
  const cases: Array<[string, string, "Video" | "Playlist"]> = [
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ", "Video"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ", "Video"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ", "Video"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ", "Video"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ", "Video"],
    [
      "https://www.youtube.com/playlist?list=PLtest123",
      "PLtest123",
      "Playlist",
    ],
    [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLtest123",
      "dQw4w9WgXcQ",
      "Video",
    ],
    ["http://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ", "Video"],
    [
      "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
      "dQw4w9WgXcQ",
      "Video",
    ],
    ["youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ", "Video"],
  ];

  for (const [input, id, kind] of cases) {
    it(`parses ${input}`, () => {
      const result = parseYoutubeUrl(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ id, kind });
      }
    });
  }

  it("rejects channel URLs", () => {
    for (const input of [
      "https://www.youtube.com/@someone",
      "https://www.youtube.com/channel/UCabc",
      "https://www.youtube.com/c/Name",
      "https://www.youtube.com/user/Name",
    ]) {
      const result = parseYoutubeUrl(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("UnsupportedHost");
    }
  });

  it("rejects clips and garbage", () => {
    expect(parseYoutubeUrl("https://www.youtube.com/clip/Ugkx").ok).toBe(false);
    expect(parseYoutubeUrl("not a url").ok).toBe(false);
    expect(parseYoutubeUrl("https://example.com/watch?v=dQw4w9WgXcQ").ok).toBe(
      false,
    );
  });
});

describe("allowlist helpers", () => {
  const base: AllowlistEntry = {
    id: "dQw4w9WgXcQ",
    kind: "Video",
    title: "A",
    thumbnailUrl: null,
    embeddable: null,
    source: "ManualUrl",
    addedAtWallMs: 1,
    lastProbedWallMs: null,
  };

  it("merges by id+kind", () => {
    const merged = mergeAllowlist(
      [base],
      [{ ...base, title: "B", addedAtWallMs: 2 }],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.title).toBe("B");
  });

  it("detects empty", () => {
    expect(isAllowlistEmpty([])).toBe(true);
    expect(isAllowlistEmpty([base])).toBe(false);
  });
});

describe("playability skip policy", () => {
  it("classifies definitive negatives", () => {
    expect(
      classifyVideoProbe({
        videoId: "x",
        title: "",
        thumbnailUrl: null,
        embeddable: false,
        privacyStatus: "public",
        ytAgeRestricted: false,
        regionBlocked: false,
        missing: false,
      }).kind,
    ).toBe("definitive");
    expect(
      classifyVideoProbe({
        videoId: "x",
        title: "",
        thumbnailUrl: null,
        embeddable: true,
        privacyStatus: "public",
        ytAgeRestricted: false,
        regionBlocked: false,
        missing: true,
      }),
    ).toMatchObject({ kind: "definitive", error: { kind: "Removed" } });
  });

  it("NoPlayableItem only for empty or all videos skipped", () => {
    const video: AllowlistEntry = {
      id: "a",
      kind: "Video",
      title: "a",
      thumbnailUrl: null,
      embeddable: false,
      source: "ManualUrl",
      addedAtWallMs: 1,
      lastProbedWallMs: null,
    };
    const playlist: AllowlistEntry = {
      ...video,
      id: "PLx",
      kind: "Playlist",
    };
    expect(noPlayableItem([], new Set())).toBe(true);
    expect(noPlayableItem([video], new Set(["a"]))).toBe(true);
    expect(noPlayableItem([video], new Set())).toBe(false);
    expect(noPlayableItem([playlist], new Set())).toBe(false);
  });
});
