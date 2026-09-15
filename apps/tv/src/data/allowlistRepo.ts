import type { AllowlistEntry, AllowlistKind, AllowlistSource } from "@littleplay/core";
import type { SqlExecutor } from "./sqliteKv";

export function migrateAllowlistTables(db: SqlExecutor): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS allowlist_entries (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      thumbnail_url TEXT,
      embeddable INTEGER,
      source TEXT NOT NULL,
      added_at_wall_ms INTEGER NOT NULL,
      last_probed_wall_ms INTEGER
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS yt_catalog_cache (
      kind TEXT PRIMARY KEY NOT NULL,
      payload_json TEXT NOT NULL,
      fetched_at_wall_ms INTEGER NOT NULL
    );
  `);
}

function embeddableToSql(v: boolean | null): number | null {
  if (v == null) return null;
  return v ? 1 : 0;
}

function embeddableFromSql(v: unknown): boolean | null {
  if (v == null) return null;
  return Number(v) === 1;
}

export class AllowlistRepository {
  constructor(private readonly db: SqlExecutor) {}

  list(): AllowlistEntry[] {
    const rows = this.db.getAll(
      `SELECT id, kind, title, thumbnail_url, embeddable, source,
              added_at_wall_ms, last_probed_wall_ms
       FROM allowlist_entries
       ORDER BY added_at_wall_ms ASC`,
    );
    return rows.map((row) => ({
      id: String(row.id),
      kind: row.kind as AllowlistKind,
      title: String(row.title),
      thumbnailUrl:
        row.thumbnail_url == null ? null : String(row.thumbnail_url),
      embeddable: embeddableFromSql(row.embeddable),
      source: row.source as AllowlistSource,
      addedAtWallMs: Number(row.added_at_wall_ms),
      lastProbedWallMs:
        row.last_probed_wall_ms == null
          ? null
          : Number(row.last_probed_wall_ms),
    }));
  }

  replaceAll(entries: readonly AllowlistEntry[]): void {
    this.db.run("DELETE FROM allowlist_entries");
    for (const e of entries) {
      this.upsert(e);
    }
  }

  upsert(entry: AllowlistEntry): void {
    this.db.run(
      `INSERT INTO allowlist_entries (
         id, kind, title, thumbnail_url, embeddable, source,
         added_at_wall_ms, last_probed_wall_ms
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         kind = excluded.kind,
         title = excluded.title,
         thumbnail_url = excluded.thumbnail_url,
         embeddable = excluded.embeddable,
         source = excluded.source,
         added_at_wall_ms = excluded.added_at_wall_ms,
         last_probed_wall_ms = excluded.last_probed_wall_ms`,
      [
        entry.id,
        entry.kind,
        entry.title,
        entry.thumbnailUrl,
        embeddableToSql(entry.embeddable),
        entry.source,
        entry.addedAtWallMs,
        entry.lastProbedWallMs,
      ],
    );
  }

  remove(id: string): void {
    this.db.run("DELETE FROM allowlist_entries WHERE id = ?", [id]);
  }

  getCatalog(kind: "playlists" | "subscriptions"): {
    payloadJson: string;
    fetchedAtWallMs: number;
  } | null {
    const row = this.db.getFirst(
      "SELECT payload_json, fetched_at_wall_ms FROM yt_catalog_cache WHERE kind = ?",
      [kind],
    );
    if (!row) return null;
    return {
      payloadJson: String(row.payload_json),
      fetchedAtWallMs: Number(row.fetched_at_wall_ms),
    };
  }

  setCatalog(
    kind: "playlists" | "subscriptions",
    payloadJson: string,
    fetchedAtWallMs: number,
  ): void {
    this.db.run(
      `INSERT INTO yt_catalog_cache (kind, payload_json, fetched_at_wall_ms)
       VALUES (?, ?, ?)
       ON CONFLICT(kind) DO UPDATE SET
         payload_json = excluded.payload_json,
         fetched_at_wall_ms = excluded.fetched_at_wall_ms`,
      [kind, payloadJson, fetchedAtWallMs],
    );
  }
}
