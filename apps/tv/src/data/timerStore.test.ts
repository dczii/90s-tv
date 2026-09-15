import { createMemorySqlExecutor, SqliteKv } from "./sqliteKv";
import { loadStore, saveTimer } from "./timerStore";
import {
  DEFAULT_POLICY,
  freshPersistedTimer,
} from "@littleplay/core";
import { describe, expect, it } from "vitest";

describe("sqlite kv timer mapping", () => {
  it("round-trips PersistedTimer without PIN fields", () => {
    const kv = new SqliteKv(createMemorySqlExecutor());
    kv.migrate();

    const fresh = loadStore(kv);
    expect(fresh.timer).toEqual(freshPersistedTimer());

    const timer = {
      ...freshPersistedTimer(),
      phase: "Playing" as const,
      policy: DEFAULT_POLICY,
      watchDeadlineElapsedMs: 1000,
      watchDeadlineWallMs: 2_000_000,
      restDeadlineElapsedMs: null,
      restDeadlineWallMs: null,
      phaseStartElapsedMs: 0,
      phaseStartWallMs: 1_999_000,
      deadlineBootCount: 3,
    };
    saveTimer(kv, timer);

    const loaded = loadStore(kv);
    expect(loaded.timer).toEqual(timer);

    const keys = [...kv.getAll().keys()];
    expect(keys.some((k) => k.startsWith("pin"))).toBe(false);
  });
});
