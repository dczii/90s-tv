import { describe, expect, it } from "vitest";
import type { AllowlistEntry } from "@nostalgiabox/core";
import { AllowlistRepository, migrateAllowlistTables } from "./allowlistRepo";
import { createAllowlistMemorySql } from "./memoryAllowlistSql";

describe("AllowlistRepository", () => {
  it("round-trips entries and catalog cache without media bodies", () => {
    const sql = createAllowlistMemorySql();
    migrateAllowlistTables(sql);
    const repo = new AllowlistRepository(sql);

    const entry: AllowlistEntry = {
      id: "dQw4w9WgXcQ",
      kind: "Video",
      title: "Test",
      thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
      embeddable: true,
      source: "ManualUrl",
      addedAtWallMs: 100,
      lastProbedWallMs: 100,
    };
    repo.upsert(entry);
    expect(repo.list()).toEqual([entry]);

    repo.setCatalog("playlists", JSON.stringify([{ id: "PLx" }]), 200);
    expect(repo.getCatalog("playlists")).toEqual({
      payloadJson: JSON.stringify([{ id: "PLx" }]),
      fetchedAtWallMs: 200,
    });

    const json = JSON.stringify(repo.list());
    expect(json).not.toMatch(/googlevideo|\.mp4|videoplayback/);
  });
});
