import { KV_KEYS, type SqliteKv } from "../data/sqliteKv";

const TOKEN_RE = /^[0-9a-f]{64}$/i;

export function loadOrCreatePhoneToken(kv: SqliteKv, bytes: Uint8Array): string {
  const existing = kv.get(KV_KEYS.phoneLinkToken);
  if (existing && TOKEN_RE.test(existing)) return existing;
  if (bytes.length !== 32) {
    throw new Error("Phone link token needs 32 bytes");
  }
  const token = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  kv.set(KV_KEYS.phoneLinkToken, token);
  return token;
}
