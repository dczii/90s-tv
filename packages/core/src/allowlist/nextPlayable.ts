/**
 * Cursor into an already-expanded allowlist (playlists → video ids in apps/tv).
 * `index` is the item index within that allowlist entry's expansion.
 */
export type AllowlistCursor = {
  entryId: string;
  index: number;
};

/** One playable video id after playlist expansion. */
export type ExpandedVideoId = {
  entryId: string;
  index: number;
  videoId: string;
};

function cursorKey(c: Pick<AllowlistCursor, "entryId" | "index">): string {
  return `${c.entryId}:${c.index}`;
}

function findStartIndex(
  expanded: readonly ExpandedVideoId[],
  cursor: AllowlistCursor | null,
  startAfter: boolean,
): number {
  if (!cursor) return 0;
  const key = cursorKey(cursor);
  const at = expanded.findIndex(
    (e) => e.entryId === cursor.entryId && e.index === cursor.index,
  );
  if (at < 0) {
    // Cursor entry gone (allowlist edited): restart from first candidate whose
    // entryId matches, else from the beginning.
    const sameEntry = expanded.findIndex((e) => e.entryId === cursor.entryId);
    if (sameEntry < 0) return 0;
    return startAfter ? sameEntry + 1 : sameEntry;
  }
  void key;
  return startAfter ? at + 1 : at;
}

/**
 * Walk already-expanded video ids and return the next playable one.
 *
 * - `cursor === null`: start at the beginning.
 * - `startAfter === false` (default): first candidate at or after cursor.
 * - `startAfter === true`: first candidate strictly after cursor (IFrame skip/end).
 *
 * Candidates whose `videoId` is in `definitiveSkipIds` are skipped.
 * Soft/unknown probes are not modeled here — caller only puts playable-or-unknown
 * ids in `expanded`, and definitive skips in the set.
 */
export function nextPlayable(
  expanded: readonly ExpandedVideoId[],
  cursor: AllowlistCursor | null,
  definitiveSkipIds: ReadonlySet<string> = new Set(),
  startAfter = false,
): ExpandedVideoId | null {
  if (expanded.length === 0) return null;
  const start = findStartIndex(expanded, cursor, startAfter);
  for (let i = start; i < expanded.length; i++) {
    const candidate = expanded[i]!;
    if (definitiveSkipIds.has(candidate.videoId)) continue;
    return candidate;
  }
  return null;
}

export function cursorFromExpanded(e: ExpandedVideoId): AllowlistCursor {
  return { entryId: e.entryId, index: e.index };
}
