import { describe, expect, it, vi } from "vitest";
import type { AllowlistEntry, TimerSnapshot } from "@littleplay/core";
import { AllowlistRepository, migrateAllowlistTables } from "../data/allowlistRepo";
import { createAllowlistMemorySql } from "../data/memoryAllowlistSql";
import type { PresetItem } from "../content/presetPlaylists";
import {
  handleCompanionRequest,
  parseQuery,
  tokenMatches,
  type CompanionDeps,
  type CompanionRequest,
  type LinkLookup,
} from "./handler";
import { lookupLink } from "./lookup";

const TOKEN = "a".repeat(32);

const PRESETS: PresetItem[] = [
  {
    id: "PLbear",
    kind: "Playlist",
    title: "Little Bear",
    description: "All episodes",
    thumbnailUrl: "https://i.ytimg.com/vi/x/hqdefault.jpg",
    url: "https://www.youtube.com/playlist?list=PLbear",
    seedVideoIds: [],
  },
  {
    id: "PLfrank",
    kind: "Playlist",
    title: "Franklin",
    description: "Full episodes",
    thumbnailUrl: "https://i.ytimg.com/vi/y/hqdefault.jpg",
    url: "https://www.youtube.com/playlist?list=PLfrank",
    seedVideoIds: [],
  },
];

function presetEntry(id: string): AllowlistEntry {
  const p = PRESETS.find((x) => x.id === id)!;
  return {
    id: p.id,
    kind: p.kind,
    title: p.title,
    thumbnailUrl: p.thumbnailUrl,
    embeddable: null,
    source: "Catalog",
    addedAtWallMs: 1,
    lastProbedWallMs: null,
  };
}

function setup(opts: {
  entries?: AllowlistEntry[];
  lookup?: LinkLookup;
  policyError?: string | null;
} = {}) {
  const sql = createAllowlistMemorySql();
  migrateAllowlistTables(sql);
  const repo = new AllowlistRepository(sql);
  for (const e of opts.entries ?? [presetEntry("PLbear")]) repo.upsert(e);
  const snapshot: TimerSnapshot = {
    phase: "Playing",
    policy: { watchDurationMs: 15 * 60_000, restDurationMs: 30 * 60_000 },
    remainingMs: 90_000,
    confirmationRequired: false,
  };
  const deps: CompanionDeps = {
    token: TOKEN,
    allowlist: repo,
    presets: PRESETS,
    snapshot: () => snapshot,
    changePolicy: vi.fn((w: number, r: number) => {
      if (opts.policyError) return opts.policyError;
      snapshot.policy = { watchDurationMs: w * 60_000, restDurationMs: r * 60_000 };
      return null;
    }),
    lookup: vi.fn(async () =>
      opts.lookup ?? { kind: "ok" as const, title: "Song", thumbnailUrl: null },
    ),
    now: () => 500,
    onEntriesChanged: vi.fn(),
    onActivity: vi.fn(),
  };
  return { deps, repo };
}

function req(
  method: string,
  path: string,
  body?: unknown,
  token: string | null = TOKEN,
): CompanionRequest {
  return {
    method,
    path,
    query: token == null ? "" : `t=${token}`,
    body: body === undefined ? "" : JSON.stringify(body),
  };
}

async function call(deps: CompanionDeps, r: CompanionRequest) {
  const res = await handleCompanionRequest(r, deps);
  const data = res.contentType.startsWith("application/json")
    ? JSON.parse(res.body)
    : res.body;
  return { res, data };
}

describe("token + routing", () => {
  it("serves the page only with the token", async () => {
    const { deps } = setup();
    const ok = await call(deps, req("GET", "/"));
    expect(ok.res.status).toBe(200);
    expect(ok.res.contentType).toMatch(/text\/html/);
    expect(ok.res.headers?.["Content-Security-Policy"]).toMatch(/default-src 'none'/);
    expect(ok.res.headers?.["Referrer-Policy"]).toBe("no-referrer");
    expect(deps.onActivity).toHaveBeenCalledWith({ kind: "connected" });

    const bad = await call(deps, req("GET", "/", undefined, "b".repeat(32)));
    expect(bad.res.status).toBe(403);
    expect(bad.data).toMatch(/expired/);
  });

  it("rejects API calls without the token", async () => {
    const { deps, repo } = setup();
    for (const t of [null, "", TOKEN.slice(1), `${TOKEN}x`]) {
      const r = await call(deps, req("POST", "/api/shows", { id: "PLfrank", selected: true }, t));
      expect(r.res.status).toBe(403);
    }
    expect(repo.list()).toHaveLength(1);
  });

  it("404s unknown paths and 405s wrong methods", async () => {
    const { deps } = setup();
    expect((await call(deps, req("GET", "/favicon.ico"))).res.status).toBe(404);
    expect((await call(deps, req("GET", "/api/links"))).res.status).toBe(405);
    expect((await call(deps, req("POST", "/api/nope", {}))).res.status).toBe(404);
  });

  it("400s non-object JSON bodies", async () => {
    const { deps } = setup();
    const r = await handleCompanionRequest(
      { method: "POST", path: "/api/links", query: `t=${TOKEN}`, body: "[1]" },
      deps,
    );
    expect(r.status).toBe(400);
  });
});

describe("state", () => {
  it("reports timer, shows with selection, and non-catalog links", async () => {
    const video: AllowlistEntry = {
      ...presetEntry("PLbear"),
      id: "dQw4w9WgXcQ",
      kind: "Video",
      title: "Song",
      source: "ManualUrl",
    };
    const { deps } = setup({ entries: [presetEntry("PLbear"), video] });
    const { data } = await call(deps, req("GET", "/api/state"));
    expect(data.timer).toMatchObject({
      watchMin: 15,
      restMin: 30,
      watchRange: [1, 60],
      restRange: [1, 180],
      phase: "Playing",
      remainingMs: 90_000,
    });
    expect(data.shows.map((s: { selected: boolean }) => s.selected)).toEqual([true, false]);
    expect(data.links).toEqual([
      { id: "dQw4w9WgXcQ", kind: "Video", title: "Song", thumbnailUrl: video.thumbnailUrl },
    ]);
  });
});

describe("links", () => {
  it("adds a pasted video with looked-up title", async () => {
    const { deps, repo } = setup({
      lookup: { kind: "ok", title: "Wheels on the Bus", thumbnailUrl: "https://i.ytimg.com/vi/a/hqdefault.jpg" },
    });
    const { res, data } = await call(
      deps,
      req("POST", "/api/links", { input: "look https://youtu.be/dQw4w9WgXcQ?si=1" }),
    );
    expect(res.status).toBe(200);
    expect(data.links[0].title).toBe("Wheels on the Bus");
    expect(repo.list().find((e) => e.id === "dQw4w9WgXcQ")).toMatchObject({
      kind: "Video",
      source: "ManualUrl",
      addedAtWallMs: 500,
    });
    expect(deps.onEntriesChanged).toHaveBeenCalledTimes(1);
    expect(deps.onActivity).toHaveBeenCalledWith({ kind: "added", title: "Wheels on the Bus" });
  });

  it("adds a playlist", async () => {
    const { deps, repo } = setup();
    await call(deps, req("POST", "/api/links", { input: "https://www.youtube.com/playlist?list=PLnew1" }));
    expect(repo.list().find((e) => e.id === "PLnew1")?.kind).toBe("Playlist");
  });

  it("falls back to a placeholder when YouTube can't be reached", async () => {
    const { deps, repo } = setup({ lookup: { kind: "unknown" } });
    await call(deps, req("POST", "/api/links", { input: "https://youtu.be/dQw4w9WgXcQ" }));
    expect(repo.list().find((e) => e.id === "dQw4w9WgXcQ")).toMatchObject({
      title: "YouTube video",
      thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    });
  });

  it("refuses videos that can't be embedded", async () => {
    const { deps, repo } = setup({
      lookup: { kind: "blocked", error: { kind: "NotEmbeddable", videoId: "dQw4w9WgXcQ" } },
    });
    const { res, data } = await call(deps, req("POST", "/api/links", { input: "https://youtu.be/dQw4w9WgXcQ" }));
    expect(res.status).toBe(422);
    expect(data.message).toMatch(/doesn't allow/);
    expect(repo.list()).toHaveLength(1);
  });

  it("explains channel links and junk", async () => {
    const { deps } = setup();
    const ch = await call(deps, req("POST", "/api/links", { input: "https://youtube.com/@kids" }));
    expect(ch.res.status).toBe(400);
    expect(ch.data.message).toMatch(/Channel/);
    const junk = await call(deps, req("POST", "/api/links", { input: 42 }));
    expect(junk.res.status).toBe(400);
  });

  it("does not duplicate an existing entry", async () => {
    const { deps, repo } = setup();
    const { data } = await call(
      deps,
      req("POST", "/api/links", { input: "https://www.youtube.com/playlist?list=PLbear" }),
    );
    expect(data.notice).toMatch(/already/);
    expect(repo.list()).toHaveLength(1);
    expect(deps.lookup).not.toHaveBeenCalled();
  });

  it("removes a link but never the last entry", async () => {
    const video: AllowlistEntry = { ...presetEntry("PLbear"), id: "dQw4w9WgXcQ", kind: "Video" };
    const { deps, repo } = setup({ entries: [presetEntry("PLbear"), video] });
    const ok = await call(deps, req("POST", "/api/remove", { id: "dQw4w9WgXcQ" }));
    expect(ok.res.status).toBe(200);
    expect(repo.list().map((e) => e.id)).toEqual(["PLbear"]);
    const last = await call(deps, req("POST", "/api/remove", { id: "PLbear" }));
    expect(last.res.status).toBe(409);
    expect(repo.list()).toHaveLength(1);
  });
});

describe("shows", () => {
  it("toggles catalog shows on and off", async () => {
    const { deps, repo } = setup();
    await call(deps, req("POST", "/api/shows", { id: "PLfrank", selected: true }));
    expect(repo.list().find((e) => e.id === "PLfrank")?.source).toBe("Catalog");
    await call(deps, req("POST", "/api/shows", { id: "PLbear", selected: false }));
    expect(repo.list().map((e) => e.id)).toEqual(["PLfrank"]);
    const last = await call(deps, req("POST", "/api/shows", { id: "PLfrank", selected: false }));
    expect(last.res.status).toBe(409);
  });

  it("rejects ids outside the catalog", async () => {
    const { deps } = setup();
    const r = await call(deps, req("POST", "/api/shows", { id: "PLevil", selected: true }));
    expect(r.res.status).toBe(404);
  });
});

describe("timer", () => {
  it("saves in-range whole minutes through changePolicy", async () => {
    const { deps } = setup();
    const { res, data } = await call(deps, req("POST", "/api/timer", { watchMin: 20, restMin: 45 }));
    expect(res.status).toBe(200);
    expect(deps.changePolicy).toHaveBeenCalledWith(20, 45);
    expect(data.timer).toMatchObject({ watchMin: 20, restMin: 45 });
  });

  it("rejects out-of-range, fractional, and non-numeric values", async () => {
    const { deps } = setup();
    for (const body of [
      { watchMin: 0, restMin: 30 },
      { watchMin: 61, restMin: 30 },
      { watchMin: 15, restMin: 181 },
      { watchMin: 1.5, restMin: 30 },
      { watchMin: "15", restMin: 30 },
    ]) {
      expect((await call(deps, req("POST", "/api/timer", body))).res.status).toBe(400);
    }
    expect(deps.changePolicy).not.toHaveBeenCalled();
  });

  it("surfaces engine rejections", async () => {
    const { deps } = setup({ policyError: "NotReady" });
    const r = await call(deps, req("POST", "/api/timer", { watchMin: 10, restMin: 10 }));
    expect(r.res.status).toBe(409);
  });
});

describe("helpers", () => {
  it("parseQuery decodes and survives bad escapes", () => {
    const q = parseQuery("t=abc&x=%E0%A4%A&y=a+b&t=second");
    expect(q.get("t")).toBe("abc");
    expect(q.get("y")).toBe("a b");
    expect(q.has("x")).toBe(false);
  });

  it("tokenMatches requires an exact match", () => {
    expect(tokenMatches(TOKEN, TOKEN)).toBe(true);
    expect(tokenMatches(TOKEN, undefined)).toBe(false);
    expect(tokenMatches("", "")).toBe(false);
    expect(tokenMatches(TOKEN, `${"a".repeat(31)}b`)).toBe(false);
  });
});

describe("lookupLink (oEmbed)", () => {
  const video = { id: "dQw4w9WgXcQ", kind: "Video" as const };
  const reply = (status: number, body: unknown = {}) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("returns title and a normalized ytimg thumbnail", async () => {
    const r = await lookupLink(
      video,
      reply(200, { title: " Song ", thumbnail_url: "https://i9.ytimg.com/vi/a/hqdefault.jpg" }),
    );
    expect(r).toEqual({ kind: "ok", title: "Song", thumbnailUrl: "https://i.ytimg.com/vi/a/hqdefault.jpg" });
  });

  it("drops thumbnails from other hosts", async () => {
    const r = await lookupLink(video, reply(200, { title: "x", thumbnail_url: "https://evil.test/a.jpg" }));
    expect(r).toMatchObject({ thumbnailUrl: null });
  });

  it("maps 401 to NotEmbeddable, 404 to Removed, 500 and network errors to unknown", async () => {
    expect(await lookupLink(video, reply(401))).toMatchObject({ error: { kind: "NotEmbeddable" } });
    expect(await lookupLink(video, reply(404))).toMatchObject({ error: { kind: "Removed" } });
    expect(await lookupLink(video, reply(500))).toEqual({ kind: "unknown" });
    const down = vi.fn(async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    expect(await lookupLink(video, down)).toEqual({ kind: "unknown" });
  });
});
