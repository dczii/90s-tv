import { createMemorySqlExecutor, SqliteKv } from "./sqliteKv";
import { loadStore, savePin, saveTimer } from "./timerStore";
import {
  DEFAULT_POLICY,
  emptyLockout,
  freshPersistedTimer,
  type PinRecord,
} from "@littleplay/core";
import { describe, expect, it } from "vitest";

describe("sqlite kv timer mapping", () => {
  it("round-trips PersistedTimer and PIN verifier without a pin plaintext key", () => {
    const kv = new SqliteKv(createMemorySqlExecutor());
    kv.migrate();

    const fresh = loadStore(kv);
    expect(fresh.timer).toEqual(freshPersistedTimer());
    expect(fresh.pin).toBeNull();

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

    const salt = new Uint8Array(16).fill(1);
    const hash = new Uint8Array(32).fill(2);
    const record: PinRecord = { salt, hash, iterations: 120_000 };
    savePin(kv, record, emptyLockout());

    const loaded = loadStore(kv);
    expect(loaded.timer).toEqual(timer);
    expect(loaded.pin?.iterations).toBe(120_000);
    expect([...loaded.pin!.salt]).toEqual([...salt]);
    expect([...loaded.pin!.hash]).toEqual([...hash]);

    const keys = [...kv.getAll().keys()];
    expect(keys).not.toContain("pin");
    expect(keys).toContain("pin_salt");
    expect(keys).toContain("pin_hash");
  });
});
