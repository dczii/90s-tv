import type { AllowlistCursor, ExpandedVideoId } from "@littleplay/core";

export type PlaybackChannel = {
  /** 1-based dial position, in allowlist order. */
  number: number;
  entryId: string;
  title: string;
  thumbnailUrl: string | null;
};

export function formatChannelNumber(number: number): string {
  return String(number).padStart(2, "0");
}

/** Each selected show is one channel, in the order it was saved. */
export function channelsFromEntries(
  entries: readonly {
    id: string;
    title: string;
    thumbnailUrl: string | null;
  }[],
): PlaybackChannel[] {
  return entries.map((entry, index) => ({
    number: index + 1,
    entryId: entry.id,
    title: entry.title,
    thumbnailUrl: entry.thumbnailUrl,
  }));
}

/**
 * Step the dial. Unknown current lands on the first channel for a positive
 * step and the last channel for a negative step. The dial wraps.
 */
export function stepChannel(
  channels: readonly PlaybackChannel[],
  currentEntryId: string | null,
  delta: number,
): PlaybackChannel | null {
  if (channels.length === 0 || delta === 0) return null;
  const at = channels.findIndex((channel) => channel.entryId === currentEntryId);
  if (at < 0) {
    return delta < 0 ? channels[channels.length - 1]! : channels[0]!;
  }
  const next = (at + delta) % channels.length;
  const wrapped = next < 0 ? next + channels.length : next;
  return channels[wrapped] ?? null;
}

/**
 * Next playable video that stays on one channel.
 * `startAfter` walks forward from the cursor and wraps to the start of that
 * channel. A cursor on another channel starts at the first playable item.
 */
export function nextInChannel(
  expanded: readonly ExpandedVideoId[],
  entryId: string,
  cursor: AllowlistCursor | null,
  definitiveSkipIds: ReadonlySet<string> = new Set(),
  startAfter = false,
): ExpandedVideoId | null {
  const channel = expanded.filter((item) => item.entryId === entryId);
  if (channel.length === 0) return null;

  let start = 0;
  if (cursor?.entryId === entryId) {
    const at = channel.findIndex((item) => item.index === cursor.index);
    if (at >= 0) start = startAfter ? at + 1 : at;
  }

  for (let step = 0; step < channel.length; step++) {
    const candidate = channel[(start + step) % channel.length]!;
    if (!definitiveSkipIds.has(candidate.videoId)) return candidate;
  }
  return null;
}

/** Resume the cursor's channel, or the first channel if that show is gone. */
export function resumeInChannel(
  expanded: readonly ExpandedVideoId[],
  cursor: AllowlistCursor | null,
  definitiveSkipIds: ReadonlySet<string> = new Set(),
): ExpandedVideoId | null {
  if (cursor) {
    const stayed = nextInChannel(
      expanded,
      cursor.entryId,
      cursor,
      definitiveSkipIds,
      false,
    );
    if (stayed) return stayed;
  }
  const firstId = expanded[0]?.entryId;
  if (!firstId) return null;
  return nextInChannel(expanded, firstId, null, definitiveSkipIds, false);
}
