import type { AllowlistCursor } from "@littleplay/core";
import { KV_KEYS, type SqliteKv } from "../data/sqliteKv";

export function loadCursor(kv: SqliteKv): AllowlistCursor | null {
  const entryId = kv.get(KV_KEYS.allowlistCursorEntryId);
  const indexRaw = kv.get(KV_KEYS.allowlistCursorIndex);
  if (!entryId || indexRaw == null) return null;
  const index = Number(indexRaw);
  if (!Number.isFinite(index) || index < 0) return null;
  return { entryId, index };
}

export function saveCursor(kv: SqliteKv, cursor: AllowlistCursor): void {
  kv.set(KV_KEYS.allowlistCursorEntryId, cursor.entryId);
  kv.set(KV_KEYS.allowlistCursorIndex, String(cursor.index));
}

export function clearCursor(kv: SqliteKv): void {
  kv.delete(KV_KEYS.allowlistCursorEntryId);
  kv.delete(KV_KEYS.allowlistCursorIndex);
}
