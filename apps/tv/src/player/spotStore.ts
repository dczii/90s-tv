import { KV_KEYS, type SqliteKv } from "../data/sqliteKv";
import type { ChannelResume } from "./channels";

/** Each channel's last playback spot, so a break or restart resumes there. */
export function loadSpots(kv: SqliteKv): Map<string, ChannelResume> {
  const spots = new Map<string, ChannelResume>();
  const raw = kv.get(KV_KEYS.channelSpots);
  if (!raw) return spots;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return spots;
  }
  if (!parsed || typeof parsed !== "object") return spots;
  for (const [entryId, value] of Object.entries(parsed)) {
    const spot = value as Partial<ChannelResume> | null;
    if (
      typeof spot?.videoId === "string" &&
      typeof spot.seconds === "number" &&
      Number.isFinite(spot.seconds) &&
      spot.seconds >= 0
    ) {
      spots.set(entryId, { videoId: spot.videoId, seconds: spot.seconds });
    }
  }
  return spots;
}

export function saveSpots(
  kv: SqliteKv,
  spots: ReadonlyMap<string, ChannelResume>,
): void {
  kv.set(KV_KEYS.channelSpots, JSON.stringify(Object.fromEntries(spots)));
}
