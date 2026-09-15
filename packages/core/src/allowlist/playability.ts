import type { AllowlistEntry, AllowlistError } from "./types.js";

/** Probe fields we care about from videos.list (YT-D18 skip policy). */
export type VideoProbe = {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  embeddable: boolean | null;
  privacyStatus: string | null;
  ytAgeRestricted: boolean;
  regionBlocked: boolean;
  /** true when videos.list returned no item for this id */
  missing: boolean;
};

export type ProbeOutcome =
  | { kind: "ok"; probe: VideoProbe }
  | { kind: "definitive"; error: AllowlistError }
  | { kind: "soft" };

export function classifyVideoProbe(probe: VideoProbe): ProbeOutcome {
  if (probe.missing) {
    return {
      kind: "definitive",
      error: { kind: "Removed", videoId: probe.videoId },
    };
  }
  if (probe.embeddable === false) {
    return {
      kind: "definitive",
      error: { kind: "NotEmbeddable", videoId: probe.videoId },
    };
  }
  if (probe.privacyStatus === "private") {
    return {
      kind: "definitive",
      error: { kind: "PrivateBlocked", videoId: probe.videoId },
    };
  }
  if (probe.ytAgeRestricted) {
    return {
      kind: "definitive",
      error: { kind: "AgeRestricted", videoId: probe.videoId },
    };
  }
  if (probe.regionBlocked) {
    return {
      kind: "definitive",
      error: { kind: "RegionRestricted", videoId: probe.videoId },
    };
  }
  return { kind: "ok", probe };
}

/**
 * NoPlayableItem only when allowlist empty or every *video* candidate has a
 * definitive skip. Soft failures do not count. Playlists need expansion in
 * Step 4; an allowlist that only has playlists is still "has content".
 */
export function noPlayableItem(
  entries: readonly AllowlistEntry[],
  definitiveSkipIds: ReadonlySet<string>,
): boolean {
  if (entries.length === 0) return true;
  const videos = entries.filter((e) => e.kind === "Video");
  if (videos.length === 0) return false;
  return videos.every((e) => definitiveSkipIds.has(e.id));
}
