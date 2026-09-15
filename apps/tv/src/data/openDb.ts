import * as SQLite from "expo-sqlite";
import { SqliteKv, type SqlExecutor, type SqlValue } from "./sqliteKv";
import { AllowlistRepository, migrateAllowlistTables } from "./allowlistRepo";

function toParams(params: SqlValue[] = []): SQLite.SQLiteBindValue[] {
  return params.map((p) => {
    if (p instanceof Uint8Array) return p;
    return p;
  });
}

export function createExpoSqlExecutor(db: SQLite.SQLiteDatabase): SqlExecutor {
  return {
    exec(sql) {
      db.execSync(sql);
    },
    run(sql, params = []) {
      db.runSync(sql, toParams(params));
    },
    getAll(sql, params = []) {
      return db.getAllSync(sql, toParams(params)) as Record<string, SqlValue>[];
    },
    getFirst(sql, params = []) {
      const row = db.getFirstSync(sql, toParams(params));
      return (row as Record<string, SqlValue> | null) ?? null;
    },
  };
}

export type AppDatabase = {
  kv: SqliteKv;
  allowlist: AllowlistRepository;
  sql: SqlExecutor;
};

export function openLittlePlayDb(): AppDatabase {
  const db = SQLite.openDatabaseSync("littleplay.sqlite");
  const sql = createExpoSqlExecutor(db);
  const kv = new SqliteKv(sql);
  kv.migrate();
  migrateAllowlistTables(sql);
  return {
    kv,
    allowlist: new AllowlistRepository(sql),
    sql,
  };
}
