import { describe, expect, it } from "vitest";
import { SqliteKv, createMemorySqlExecutor } from "../data/sqliteKv";
import { loadOrCreatePhoneToken } from "./phoneToken";

describe("loadOrCreatePhoneToken", () => {
  it("stores a token once and reuses it", () => {
    const kv = new SqliteKv(createMemorySqlExecutor());
    const bytes = Uint8Array.from({ length: 32 }, (_, index) => index);
    const first = loadOrCreatePhoneToken(kv, bytes);
    const second = loadOrCreatePhoneToken(kv, Uint8Array.from({ length: 32 }, () => 9));
    expect(first).toHaveLength(64);
    expect(second).toBe(first);
    expect(first.startsWith("000102")).toBe(true);
  });
});
