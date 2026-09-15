import { describe, expect, it } from "vitest";
import {
  LOCKOUT_BASE_MS,
  LOCKOUT_CAP_MS,
  PinGate,
  emptyLockout,
} from "./gate.js";
import { PIN_ITERATIONS, hashPin, verifyPin } from "./hasher.js";
import type { TimeView } from "../timer/types.js";

const FIXTURE_SALT = new Uint8Array(16).fill(7);

function now(
  elapsedRealtimeMs: number,
  wallClockMs = elapsedRealtimeMs,
  bootCount: number | null = 1,
): TimeView {
  return { elapsedRealtimeMs, wallClockMs, bootCount };
}

describe("PinHasher", () => {
  it("hashes and verifies with PBKDF2-HMAC-SHA256", async () => {
    const record = await hashPin("1234", FIXTURE_SALT, 1_000);
    expect(record.salt).toEqual(FIXTURE_SALT);
    expect(record.hash.length).toBe(32);
    expect(record.iterations).toBe(1_000);
    expect(await verifyPin("1234", record)).toBe(true);
    expect(await verifyPin("9999", record)).toBe(false);
  });

  it("rejects non-4-digit format on hash", async () => {
    await expect(hashPin("12", FIXTURE_SALT, 10)).rejects.toThrow("InvalidFormat");
    await expect(hashPin("abcd", FIXTURE_SALT, 10)).rejects.toThrow(
      "InvalidFormat",
    );
  });

  it("uses 120_000 iterations by default (YT-D10 / RN-D7)", async () => {
    const record = await hashPin("4242", FIXTURE_SALT);
    expect(record.iterations).toBe(PIN_ITERATIONS);
    expect(await verifyPin("4242", record)).toBe(true);
  });
});

describe("PinGate lockout (YT-D11)", () => {
  async function gateWithPin(pin = "1234"): Promise<PinGate> {
    const record = await hashPin(pin, FIXTURE_SALT, 500);
    return new PinGate(record, emptyLockout());
  }

  it("rejects InvalidFormat without counting a failure", async () => {
    const gate = await gateWithPin();
    const result = await gate.verify("12ab", now(0));
    expect(result).toEqual({
      kind: "Failed",
      error: { kind: "InvalidFormat" },
    });
    expect(gate.lockout().failedAttempts).toBe(0);
  });

  it("locks after 5th mismatch for 30s; verify while locked does not increment", async () => {
    const gate = await gateWithPin();
    for (let i = 0; i < 5; i++) {
      const r = await gate.verify("0000", now(i));
      expect(r.kind).toBe("Failed");
      if (r.kind === "Failed") expect(r.error.kind).toBe("Mismatch");
    }
    expect(gate.lockout().failedAttempts).toBe(5);
    expect(gate.lockout().lockoutElapsedMs).toBe(4 + LOCKOUT_BASE_MS);

    const locked = await gate.verify("0000", now(4 + 1_000));
    expect(locked.kind).toBe("Failed");
    if (locked.kind === "Failed" && locked.error.kind === "LockedOut") {
      expect(locked.error.remainingMs).toBe(LOCKOUT_BASE_MS - 1_000);
    }
    expect(gate.lockout().failedAttempts).toBe(5);

    // Wrong attempt also blocked; correct pin blocked too while locked.
    const correctLocked = await gate.verify("1234", now(4 + 1_000));
    expect(correctLocked.kind).toBe("Failed");
    if (correctLocked.kind === "Failed") {
      expect(correctLocked.error.kind).toBe("LockedOut");
    }
  });

  it("doubles lockout after expiry up to 15 min; success resets ladder", async () => {
    const gate = await gateWithPin();
    let t = 0;
    for (let i = 0; i < 5; i++) {
      await gate.verify("0000", now(t++));
    }
    // Expire first 30s lockout
    t = 4 + LOCKOUT_BASE_MS + 1;
    await gate.verify("0000", now(t));
    expect(gate.lockout().failedAttempts).toBe(6);
    expect(gate.lockout().lockoutElapsedMs).toBe(t + 60_000);

    // Expire 60s, mismatch → 120s
    t = (gate.lockout().lockoutElapsedMs ?? 0) + 1;
    await gate.verify("0000", now(t));
    expect(gate.lockout().failedAttempts).toBe(7);
    expect(gate.lockout().lockoutElapsedMs).toBe(t + 120_000);

    // Jump failures to near cap
    for (let i = 0; i < 10; i++) {
      t = (gate.lockout().lockoutElapsedMs ?? t) + 1;
      await gate.verify("0000", now(t));
    }
    const duration =
      (gate.lockout().lockoutElapsedMs ?? 0) - t;
    expect(duration).toBeLessThanOrEqual(LOCKOUT_CAP_MS);

    // Success after lockout expires resets
    t = (gate.lockout().lockoutElapsedMs ?? 0) + 1;
    const ok = await gate.verify("1234", now(t));
    expect(ok).toEqual({ kind: "Ok" });
    expect(gate.lockout()).toEqual(emptyLockout());
  });

  it("lockout survives reconstructed PinGate from persisted fields", async () => {
    const gate = await gateWithPin();
    for (let i = 0; i < 5; i++) await gate.verify("0000", now(i));
    const rebuilt = new PinGate(gate.pinRecord(), gate.lockout());
    const locked = await rebuilt.verify("1234", now(1));
    expect(locked.kind).toBe("Failed");
    if (locked.kind === "Failed") expect(locked.error.kind).toBe("LockedOut");
  });

  it("setPin replaces the verifier and clears lockout", async () => {
    const gate = await gateWithPin("1111");
    await gate.verify("0000", now(0));
    const salt = new Uint8Array(16).fill(9);
    await gate.setPin("9999", salt);
    expect(gate.lockout().failedAttempts).toBe(0);
    expect(await gate.verify("9999", now(1))).toEqual({ kind: "Ok" });
  });
});
