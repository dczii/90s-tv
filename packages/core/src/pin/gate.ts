import type { TimeView } from "../timer/types.js";
import {
  PIN_ITERATIONS,
  PIN_PATTERN,
  hashPin,
  verifyPin,
  type PinRecord,
} from "./hasher.js";

export type PinLockout = {
  failedAttempts: number;
  lockoutElapsedMs: number | null;
  lockoutWallMs: number | null;
  lockoutBootCount: number | null;
};

export type PinError =
  | { kind: "InvalidFormat" }
  | { kind: "Mismatch" }
  | { kind: "LockedOut"; remainingMs: number };

export type PinResult =
  | { kind: "Ok" }
  | { kind: "Failed"; error: PinError };

export const LOCKOUT_AFTER_FAILURES = 5;
export const LOCKOUT_BASE_MS = 30_000;
export const LOCKOUT_CAP_MS = 15 * 60_000;

export function emptyLockout(): PinLockout {
  return {
    failedAttempts: 0,
    lockoutElapsedMs: null,
    lockoutWallMs: null,
    lockoutBootCount: null,
  };
}

function floor0(n: number): number {
  return n < 0 ? 0 : n;
}

function lockoutDurationForAttempt(failedAttempts: number): number {
  // 5th failure → 30s; 6th → 60s; … cap 15 min (YT-D11).
  const exp = failedAttempts - LOCKOUT_AFTER_FAILURES;
  if (exp < 0) return 0;
  const ms = LOCKOUT_BASE_MS * 2 ** exp;
  return ms > LOCKOUT_CAP_MS ? LOCKOUT_CAP_MS : ms;
}

/**
 * PIN gate with dual-clock lockout (YT-D10, YT-D11). verify is async (RN-D7).
 */
export class PinGate {
  private record: PinRecord;
  private lock: PinLockout;
  private lockoutRewriteDoneThisProcess = false;

  constructor(record: PinRecord, lockout: PinLockout = emptyLockout()) {
    this.record = {
      salt: new Uint8Array(record.salt),
      hash: new Uint8Array(record.hash),
      iterations: record.iterations,
    };
    this.lock = { ...lockout };
  }

  async verify(pin: string, now: TimeView): Promise<PinResult> {
    if (!PIN_PATTERN.test(pin)) {
      return { kind: "Failed", error: { kind: "InvalidFormat" } };
    }

    this.applyLockoutRecovery(now);
    const lockedRemaining = this.lockoutRemainingMs(now);
    if (lockedRemaining > 0) {
      return {
        kind: "Failed",
        error: { kind: "LockedOut", remainingMs: lockedRemaining },
      };
    }

    const ok = await verifyPin(pin, this.record);
    if (ok) {
      this.lock = emptyLockout();
      return { kind: "Ok" };
    }

    this.lock.failedAttempts += 1;
    if (this.lock.failedAttempts >= LOCKOUT_AFTER_FAILURES) {
      const duration = lockoutDurationForAttempt(this.lock.failedAttempts);
      this.lock.lockoutElapsedMs = now.elapsedRealtimeMs + duration;
      this.lock.lockoutWallMs = now.wallClockMs + duration;
      this.lock.lockoutBootCount = now.bootCount;
    }
    return { kind: "Failed", error: { kind: "Mismatch" } };
  }

  async setPin(pin: string, salt: Uint8Array): Promise<PinRecord> {
    if (!PIN_PATTERN.test(pin)) {
      throw new Error("InvalidFormat");
    }
    this.record = await hashPin(pin, salt, PIN_ITERATIONS);
    this.lock = emptyLockout();
    return {
      salt: new Uint8Array(this.record.salt),
      hash: new Uint8Array(this.record.hash),
      iterations: this.record.iterations,
    };
  }

  lockout(): PinLockout {
    return { ...this.lock };
  }

  pinRecord(): PinRecord {
    return {
      salt: new Uint8Array(this.record.salt),
      hash: new Uint8Array(this.record.hash),
      iterations: this.record.iterations,
    };
  }

  private lockoutRemainingMs(now: TimeView): number {
    if (this.lock.lockoutElapsedMs == null && this.lock.lockoutWallMs == null) {
      return 0;
    }
    if (this.needsWallRecovery(now)) {
      return floor0((this.lock.lockoutWallMs ?? 0) - now.wallClockMs);
    }
    return floor0((this.lock.lockoutElapsedMs ?? 0) - now.elapsedRealtimeMs);
  }

  private needsWallRecovery(now: TimeView): boolean {
    if (now.bootCount == null) return true;
    if (this.lock.lockoutBootCount == null) return true;
    return now.bootCount !== this.lock.lockoutBootCount;
  }

  private applyLockoutRecovery(now: TimeView): void {
    if (!this.needsWallRecovery(now)) return;
    if (now.bootCount == null && this.lockoutRewriteDoneThisProcess) return;
    if (this.lock.lockoutWallMs != null) {
      this.lock.lockoutElapsedMs =
        now.elapsedRealtimeMs +
        floor0(this.lock.lockoutWallMs - now.wallClockMs);
    }
    this.lock.lockoutBootCount = now.bootCount;
    if (now.bootCount == null) this.lockoutRewriteDoneThisProcess = true;
  }
}
