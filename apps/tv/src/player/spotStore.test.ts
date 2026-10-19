import { describe, expect, it } from "vitest";
import { createMemorySqlExecutor, KV_KEYS, SqliteKv } from "../data/sqliteKv";
import { loadSpots, saveSpots } from "./spotStore";

function memoryKv(): SqliteKv {
  const kv = new SqliteKv(createMemorySqlExecutor());
  kv.migrate();
  return kv;
}

describe("spotStore", () => {
  it("round-trips each channel's spot", () => {
    const kv = memoryKv();
    saveSpots(
      kv,
      new Map([
        ["bear", { videoId: "b1", seconds: 312.5 }],
        ["franklin", { videoId: "f0", seconds: 0 }],
      ]),
    );
    expect([...loadSpots(kv)]).toEqual([
      ["bear", { videoId: "b1", seconds: 312.5 }],
      ["franklin", { videoId: "f0", seconds: 0 }],
    ]);
  });

  it("returns no spots when nothing was saved", () => {
    expect(loadSpots(memoryKv()).size).toBe(0);
  });

  it("drops malformed rows instead of throwing", () => {
    const kv = memoryKv();
    kv.set(KV_KEYS.channelSpots, "not json");
    expect(loadSpots(kv).size).toBe(0);
    kv.set(
      KV_KEYS.channelSpots,
      JSON.stringify({
        bear: { videoId: "b1", seconds: 40 },
        bad: { videoId: 7, seconds: 1 },
        neg: { videoId: "x", seconds: -3 },
      }),
    );
    expect([...loadSpots(kv).keys()]).toEqual(["bear"]);
  });
});
