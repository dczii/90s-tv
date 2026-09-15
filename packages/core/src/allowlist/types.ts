export type AllowlistKind = "Video" | "Playlist";

export type AllowlistSource = "Account" | "ManualUrl" | "Catalog";

export type AllowlistEntry = {
  id: string;
  kind: AllowlistKind;
  title: string;
  thumbnailUrl: string | null;
  /** null = unknown (playlist, or not yet probed) */
  embeddable: boolean | null;
  source: AllowlistSource;
  addedAtWallMs: number;
  lastProbedWallMs: number | null;
};

export type AllowlistError =
  | { kind: "Empty" }
  | { kind: "MalformedUrl"; input: string }
  | { kind: "UnsupportedHost"; input: string }
  | { kind: "NotEmbeddable"; videoId: string }
  | { kind: "PrivateBlocked"; videoId: string }
  | { kind: "AgeRestricted"; videoId: string }
  | { kind: "RegionRestricted"; videoId: string }
  | { kind: "Removed"; videoId: string }
  | { kind: "NoPlayableItem" };

export type ParsedYoutubeUrl = {
  id: string;
  kind: AllowlistKind;
};

export const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;
export const PROBE_TTL_MS = 24 * 60 * 60 * 1000;

export function allowlistEntryKey(entry: Pick<AllowlistEntry, "id" | "kind">): string {
  return `${entry.kind}:${entry.id}`;
}

/** Dedupe by id+kind; last write wins. */
export function mergeAllowlist(
  existing: readonly AllowlistEntry[],
  incoming: readonly AllowlistEntry[],
): AllowlistEntry[] {
  const map = new Map<string, AllowlistEntry>();
  for (const e of existing) map.set(allowlistEntryKey(e), e);
  for (const e of incoming) map.set(allowlistEntryKey(e), e);
  return [...map.values()];
}

export function isAllowlistEmpty(entries: readonly AllowlistEntry[]): boolean {
  return entries.length === 0;
}
