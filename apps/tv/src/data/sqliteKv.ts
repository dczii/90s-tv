/** Injected SQL executor so Node can unit-test the kv mapping. */
export type SqlExecutor = {
  exec(sql: string): void;
  run(sql: string, params?: SqlValue[]): void;
  getAll(sql: string, params?: SqlValue[]): Record<string, SqlValue>[];
  getFirst(sql: string, params?: SqlValue[]): Record<string, SqlValue> | null;
};

export type SqlValue = string | number | null | Uint8Array;

export const KV_KEYS = {
  phase: "phase",
  watchDurationMs: "watch_duration_ms",
  restDurationMs: "rest_duration_ms",
  watchDeadlineElapsedMs: "watch_deadline_elapsed_ms",
  watchDeadlineWallMs: "watch_deadline_wall_ms",
  restDeadlineElapsedMs: "rest_deadline_elapsed_ms",
  restDeadlineWallMs: "rest_deadline_wall_ms",
  phaseStartElapsedMs: "phase_start_elapsed_ms",
  phaseStartWallMs: "phase_start_wall_ms",
  deadlineBootCount: "deadline_boot_count",
  allowlistCursorEntryId: "allowlist_cursor_entry_id",
  allowlistCursorIndex: "allowlist_cursor_index",
} as const;

export type KvKey = (typeof KV_KEYS)[keyof typeof KV_KEYS];

export class SqliteKv {
  constructor(private readonly db: SqlExecutor) {}

  migrate(): void {
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)",
    );
  }

  get(key: string): string | null {
    const row = this.db.getFirst("SELECT value FROM kv WHERE key = ?", [key]);
    if (!row) return null;
    const value = row.value;
    return typeof value === "string" ? value : null;
  }

  set(key: string, value: string): void {
    this.db.run(
      "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, value],
    );
  }

  delete(key: string): void {
    this.db.run("DELETE FROM kv WHERE key = ?", [key]);
  }

  getAll(): Map<string, string> {
    const rows = this.db.getAll("SELECT key, value FROM kv");
    const map = new Map<string, string>();
    for (const row of rows) {
      if (typeof row.key === "string" && typeof row.value === "string") {
        map.set(row.key, row.value);
      }
    }
    return map;
  }
}

/** In-memory driver for Node unit tests of the kv mapping. */
export function createMemorySqlExecutor(): SqlExecutor {
  const store = new Map<string, string>();
  return {
    exec() {
      /* schema is implicit for memory */
    },
    run(sql, params = []) {
      if (sql.startsWith("INSERT")) {
        const key = String(params[0]);
        const value = String(params[1]);
        store.set(key, value);
        return;
      }
      if (sql.startsWith("DELETE")) {
        store.delete(String(params[0]));
      }
    },
    getAll() {
      return [...store.entries()].map(([key, value]) => ({ key, value }));
    },
    getFirst(sql, params = []) {
      if (sql.includes("WHERE key")) {
        const key = String(params[0]);
        const value = store.get(key);
        return value === undefined ? null : { value };
      }
      return null;
    },
  };
}
