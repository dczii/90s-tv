import {
  freshPersistedTimer,
  type PersistedTimer,
  type TimerPhase,
  type TimerPolicy,
} from "@littleplay/core";
import { KV_KEYS, type SqliteKv } from "./sqliteKv";

function readNumber(map: Map<string, string>, key: string): number | null {
  const raw = map.get(key);
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function writeNullable(kv: SqliteKv, key: string, value: number | null): void {
  if (value == null) {
    kv.delete(key);
  } else {
    kv.set(key, String(value));
  }
}

export type LoadedStore = {
  timer: PersistedTimer;
};

export function loadStore(kv: SqliteKv): LoadedStore {
  const map = kv.getAll();
  if (!map.has(KV_KEYS.phase)) {
    return { timer: freshPersistedTimer() };
  }

  const phase = (map.get(KV_KEYS.phase) ?? "Setup") as TimerPhase;
  const policy: TimerPolicy = {
    watchDurationMs: readNumber(map, KV_KEYS.watchDurationMs) ?? 15 * 60_000,
    restDurationMs: readNumber(map, KV_KEYS.restDurationMs) ?? 30 * 60_000,
  };

  const timer: PersistedTimer = {
    phase,
    policy,
    watchDeadlineElapsedMs: readNumber(map, KV_KEYS.watchDeadlineElapsedMs),
    watchDeadlineWallMs: readNumber(map, KV_KEYS.watchDeadlineWallMs),
    restDeadlineElapsedMs: readNumber(map, KV_KEYS.restDeadlineElapsedMs),
    restDeadlineWallMs: readNumber(map, KV_KEYS.restDeadlineWallMs),
    phaseStartElapsedMs: readNumber(map, KV_KEYS.phaseStartElapsedMs),
    phaseStartWallMs: readNumber(map, KV_KEYS.phaseStartWallMs),
    deadlineBootCount: readNumber(map, KV_KEYS.deadlineBootCount),
  };

  return { timer };
}

export function saveTimer(kv: SqliteKv, timer: PersistedTimer): void {
  kv.set(KV_KEYS.phase, timer.phase);
  kv.set(KV_KEYS.watchDurationMs, String(timer.policy.watchDurationMs));
  kv.set(KV_KEYS.restDurationMs, String(timer.policy.restDurationMs));
  writeNullable(kv, KV_KEYS.watchDeadlineElapsedMs, timer.watchDeadlineElapsedMs);
  writeNullable(kv, KV_KEYS.watchDeadlineWallMs, timer.watchDeadlineWallMs);
  writeNullable(kv, KV_KEYS.restDeadlineElapsedMs, timer.restDeadlineElapsedMs);
  writeNullable(kv, KV_KEYS.restDeadlineWallMs, timer.restDeadlineWallMs);
  writeNullable(kv, KV_KEYS.phaseStartElapsedMs, timer.phaseStartElapsedMs);
  writeNullable(kv, KV_KEYS.phaseStartWallMs, timer.phaseStartWallMs);
  writeNullable(kv, KV_KEYS.deadlineBootCount, timer.deadlineBootCount);
}
