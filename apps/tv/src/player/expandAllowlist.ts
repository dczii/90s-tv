import {
  classifyVideoProbe,
  nextPlayable,
  type AllowlistCursor,
  type AllowlistEntry,
  type ExpandedVideoId,
  type VideoProbe,
} from "@littleplay/core";
import { seedVideoIdsFor } from "../content/presetPlaylists";
import {
  fetchVideoMetadata,
  listPlaylistVideoIds,
  type AuthMode,
  type YoutubeApiError,
  type YoutubeRequestOpts,
} from "../youtube/client";

export type ExpandResult =
  | {
      status: "ok";
      expanded: ExpandedVideoId[];
      definitiveSkipIds: Set<string>;
      next: ExpandedVideoId | null;
    }
  | { status: "error"; error: YoutubeApiError };

function pushSeeds(
  expanded: ExpandedVideoId[],
  entryId: string,
  seeds: readonly string[],
) {
  seeds.forEach((videoId, index) => {
    expanded.push({ entryId, index, videoId });
  });
}

/**
 * Expand allowlist entries to video ids (playlists via playlistItems.list),
 * probe unknowns, then pick nextPlayable from cursor.
 * Catalog presets fall back to seed video ids when Data API expand fails.
 */
export async function expandAndPickNext(
  entries: readonly AllowlistEntry[],
  cursor: AllowlistCursor | null,
  auth: AuthMode,
  apiKey: string,
  opts: YoutubeRequestOpts = {},
  startAfter = false,
): Promise<ExpandResult> {
  const expanded: ExpandedVideoId[] = [];
  const definitiveSkipIds = new Set<string>();

  for (const entry of entries) {
    if (entry.kind === "Video") {
      expanded.push({
        entryId: entry.id,
        index: 0,
        videoId: entry.id,
      });
      if (entry.embeddable === false) {
        definitiveSkipIds.add(entry.id);
      }
      continue;
    }

    const ids = await listPlaylistVideoIds(entry.id, auth, apiKey, opts);
    if (!(ids instanceof Array)) {
      const seeds = seedVideoIdsFor(entry.id);
      if (seeds.length > 0) {
        pushSeeds(expanded, entry.id, seeds);
        continue;
      }
      if (
        ids.kind === "QuotaExceeded" ||
        ids.kind === "AuthExpired" ||
        ids.kind === "NetworkDown" ||
        ids.kind === "ConfigMissing" ||
        ids.kind === "HttpError"
      ) {
        continue;
      }
      return { status: "error", error: ids };
    }
    ids.forEach((videoId, index) => {
      expanded.push({ entryId: entry.id, index, videoId });
    });
  }

  // Probe video ids we do not already know are definitive skips.
  const toProbe = [
    ...new Set(
      expanded
        .map((e) => e.videoId)
        .filter((id) => !definitiveSkipIds.has(id)),
    ),
  ];
  for (let i = 0; i < toProbe.length; i += 50) {
    const chunk = toProbe.slice(i, i + 50);
    const meta = await fetchVideoMetadata(chunk, auth, apiKey, opts);
    if (!(meta instanceof Array)) {
      // Soft: allow playback with unprobed ids when API is blocked.
      break;
    }
    for (const m of meta) {
      const probe: VideoProbe = {
        videoId: m.id,
        title: m.title,
        thumbnailUrl: m.thumbnailUrl,
        embeddable: m.embeddable,
        privacyStatus: m.privacyStatus,
        ytAgeRestricted: m.ytAgeRestricted,
        regionBlocked: m.regionBlocked,
        missing: m.missing,
      };
      const outcome = classifyVideoProbe(probe);
      if (outcome.kind === "definitive") {
        definitiveSkipIds.add(m.id);
      }
    }
  }

  const next = nextPlayable(expanded, cursor, definitiveSkipIds, startAfter);
  return { status: "ok", expanded, definitiveSkipIds, next };
}
