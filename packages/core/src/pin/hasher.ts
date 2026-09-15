import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";

export const PIN_ITERATIONS = 120_000;
export const PIN_SALT_LENGTH = 16;
export const PIN_DK_LENGTH = 32;
export const PIN_PATTERN = /^\d{4}$/;

export type PinRecord = {
  salt: Uint8Array;
  hash: Uint8Array;
  iterations: number;
};

/** Constant-time compare (MessageDigest.isEqual equivalent). */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

export async function hashPin(
  pin: string,
  salt: Uint8Array,
  iterations: number = PIN_ITERATIONS,
): Promise<PinRecord> {
  if (!PIN_PATTERN.test(pin)) {
    throw new Error("InvalidFormat");
  }
  if (salt.length !== PIN_SALT_LENGTH) {
    throw new Error("Salt must be 16 bytes");
  }
  const hash = await pbkdf2Async(sha256, pin, salt, {
    c: iterations,
    dkLen: PIN_DK_LENGTH,
  });
  return { salt: new Uint8Array(salt), hash, iterations };
}

export async function verifyPin(
  pin: string,
  record: PinRecord,
): Promise<boolean> {
  if (!PIN_PATTERN.test(pin)) return false;
  const candidate = await pbkdf2Async(sha256, pin, record.salt, {
    c: record.iterations,
    dkLen: PIN_DK_LENGTH,
  });
  return equalBytes(candidate, record.hash);
}
