import type { SqlExecutor, SqlValue } from "./sqliteKv";

/**
 * Tiny in-memory SQL shim covering the allowlist + catalog statements we use.
 * Not a general SQLite — enough for Node mapping tests (RN-D19).
 */
export function createAllowlistMemorySql(): SqlExecutor {
  type EntryRow = {
    id: string;
    kind: string;
    title: string;
    thumbnail_url: string | null;
    embeddable: number | null;
    source: string;
    added_at_wall_ms: number;
    last_probed_wall_ms: number | null;
  };
  const entries = new Map<string, EntryRow>();
  const catalog = new Map<
    string,
    { payload_json: string; fetched_at_wall_ms: number }
  >();

  return {
    exec() {
      /* CREATE TABLE IF NOT EXISTS — no-op */
    },
    run(sql, params = []) {
      const s = sql.replace(/\s+/g, " ").trim();
      if (s.startsWith("DELETE FROM allowlist_entries WHERE")) {
        entries.delete(String(params[0]));
        return;
      }
      if (s.startsWith("DELETE FROM allowlist_entries")) {
        entries.clear();
        return;
      }
      if (s.includes("INSERT INTO allowlist_entries")) {
        const row: EntryRow = {
          id: String(params[0]),
          kind: String(params[1]),
          title: String(params[2]),
          thumbnail_url: (params[3] as string | null) ?? null,
          embeddable: (params[4] as number | null) ?? null,
          source: String(params[5]),
          added_at_wall_ms: Number(params[6]),
          last_probed_wall_ms: (params[7] as number | null) ?? null,
        };
        entries.set(row.id, row);
        return;
      }
      if (s.includes("INSERT INTO yt_catalog_cache")) {
        catalog.set(String(params[0]), {
          payload_json: String(params[1]),
          fetched_at_wall_ms: Number(params[2]),
        });
      }
    },
    getAll(sql) {
      if (sql.includes("FROM allowlist_entries")) {
        return [...entries.values()].sort(
          (a, b) => a.added_at_wall_ms - b.added_at_wall_ms,
        ) as unknown as Record<string, SqlValue>[];
      }
      return [];
    },
    getFirst(sql, params = []) {
      if (sql.includes("FROM yt_catalog_cache")) {
        const row = catalog.get(String(params[0]));
        return row ? (row as unknown as Record<string, SqlValue>) : null;
      }
      return null;
    },
  };
}
