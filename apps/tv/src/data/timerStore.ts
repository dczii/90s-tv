import {
  emptyLockout,
  freshPersistedTimer,
  type PersistedTimer,
  type PinLockout,
  type PinRecord,
  type TimerPhase,
  type TimerPolicy,
} from "@nostalgiabox/core";
import { KV_KEYS, type SqliteKv } from "./sqliteKv";

function encodeBytes(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]!);
  }
  // btoa is available in RN / Hermes; Node tests polyfill via Buffer.
  if (typeof btoa === "function") {
    return btoa(s);
  }
  return Buffer.from(bytes).toString("base64");
}

function decodeBytes(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

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
  pin: PinRecord | null;
  lockout: PinLockout;
};

export function loadStore(kv: SqliteKv): LoadedStore {
  const map = kv.getAll();
  if (!map.has(KV_KEYS.phase)) {
    return {
      timer: freshPersistedTimer(),
      pin: null,
      lockout: emptyLockout(),
    };
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

  const saltB64 = map.get(KV_KEYS.pinSalt);
  const hashB64 = map.get(KV_KEYS.pinHash);
  const iterations = readNumber(map, KV_KEYS.pinIterations);
  let pin: PinRecord | null = null;
  if (saltB64 && hashB64 && iterations != null) {
    pin = {
      salt: decodeBytes(saltB64),
      hash: decodeBytes(hashB64),
      iterations,
    };
  }

  const lockout: PinLockout = {
    failedAttempts: readNumber(map, KV_KEYS.pinFailedAttempts) ?? 0,
    lockoutElapsedMs: readNumber(map, KV_KEYS.pinLockoutElapsedMs),
    lockoutWallMs: readNumber(map, KV_KEYS.pinLockoutWallMs),
    lockoutBootCount: readNumber(map, KV_KEYS.pinLockoutBootCount),
  };

  return { timer, pin, lockout };
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

export function savePin(
  kv: SqliteKv,
  record: PinRecord,
  lockout: PinLockout,
): void {
  kv.set(KV_KEYS.pinSalt, encodeBytes(record.salt));
  kv.set(KV_KEYS.pinHash, encodeBytes(record.hash));
  kv.set(KV_KEYS.pinIterations, String(record.iterations));
  kv.set(KV_KEYS.pinFailedAttempts, String(lockout.failedAttempts));
  writeNullable(kv, KV_KEYS.pinLockoutElapsedMs, lockout.lockoutElapsedMs);
  writeNullable(kv, KV_KEYS.pinLockoutWallMs, lockout.lockoutWallMs);
  writeNullable(kv, KV_KEYS.pinLockoutBootCount, lockout.lockoutBootCount);
}

/** Grep guard: never write a raw PIN key. */
export const FORBIDDEN_PIN_PLAINTEXT_KEY = "pin";
