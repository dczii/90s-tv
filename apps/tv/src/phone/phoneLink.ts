import { getRandomBytes } from "expo-crypto";
import { lanIpv4, startPhoneLinkServer } from "phone-link";
import type { SqliteKv } from "../data/sqliteKv";
import { loadOrCreatePhoneToken } from "./phoneToken";

/** Start the LAN server and return the URL encoded by the parent-settings QR. */
export function startPhoneLink(kv: SqliteKv): string | null {
  const token = loadOrCreatePhoneToken(kv, getRandomBytes(32));
  const { port } = startPhoneLinkServer(token);
  const host = lanIpv4().trim();
  if (!host) return null;
  return `http://${host}:${port}/s/${token}`;
}
