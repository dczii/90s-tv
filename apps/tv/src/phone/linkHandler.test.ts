import { describe, expect, it, vi } from "vitest";
import { validatePolicy } from "@littleplay/core";
import { AllowlistRepository, migrateAllowlistTables } from "../data/allowlistRepo";
import { createAllowlistMemorySql } from "../data/memoryAllowlistSql";
import {
  handleLinkRequest,
  handlePhoneRequest,
  phoneChannelId,
  type PhoneActions,
  type PhoneSnapshot,
} from "./linkHandler";

function repo(): AllowlistRepository {
  const sql = createAllowlistMemorySql();
  migrateAllowlistTables(sql);
  return new AllowlistRepository(sql);
}

const now = 1_700_000_000_000;

describe("handleLinkRequest", () => {
  it("adds a watch URL and lists the canonical link", async () => {
    const allowlist = repo();
    const added = await handleLinkRequest(
      allowlist,
      {
        method: "POST",
        route: "add",
        body: JSON.stringify({
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        }),
        entryId: "",
      },
      {
        now,
        lookup: async () => ({
          title: "Sample",
          thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        }),
      },
    );
    expect(added.status).toBe(201);
    expect(added.changed).toBe(true);
    expect(JSON.parse(added.body).link).toEqual({
      id: "dQw4w9WgXcQ",
      kind: "Video",
      title: "Sample",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    expect(allowlist.list()[0]?.source).toBe("ManualUrl");

    const listed = await handleLinkRequest(
      allowlist,
      { method: "GET", route: "list", body: "", entryId: "" },
      { now },
    );
    expect(JSON.parse(listed.body).links).toHaveLength(1);
  });

  it("adds a playlist and a youtu.be link", async () => {
    const allowlist = repo();
    const playlist = await handleLinkRequest(
      allowlist,
      {
        method: "POST",
        route: "add",
        body: JSON.stringify({
          url: "https://www.youtube.com/playlist?list=PLtest123",
        }),
        entryId: "",
      },
      { now },
    );
    expect(JSON.parse(playlist.body).link.url).toBe(
      "https://www.youtube.com/playlist?list=PLtest123",
    );

    const shortLink = await handleLinkRequest(
      allowlist,
      {
        method: "POST",
        route: "add",
        body: JSON.stringify({ url: "https://youtu.be/dQw4w9WgXcQ" }),
        entryId: "",
      },
      { now, lookup: async () => null },
    );
    expect(JSON.parse(shortLink.body).link).toMatchObject({
      id: "dQw4w9WgXcQ",
      kind: "Video",
      title: "dQw4w9WgXcQ",
    });
  });

  it("rejects a bad URL, a channel, and a duplicate", async () => {
    const allowlist = repo();
    const bad = await handleLinkRequest(
      allowlist,
      {
        method: "POST",
        route: "add",
        body: JSON.stringify({ url: "not a url" }),
        entryId: "",
      },
      { now },
    );
    expect(bad.status).toBe(400);
    expect(JSON.parse(bad.body).error).toMatch(/YouTube link/);

    const channel = await handleLinkRequest(
      allowlist,
      {
        method: "POST",
        route: "add",
        body: JSON.stringify({ url: "https://www.youtube.com/@kids" }),
        entryId: "",
      },
      { now },
    );
    expect(channel.status).toBe(400);
    expect(JSON.parse(channel.body).error).toMatch(/video and playlist/);

    await handleLinkRequest(
      allowlist,
      {
        method: "POST",
        route: "add",
        body: JSON.stringify({ url: "https://youtu.be/dQw4w9WgXcQ" }),
        entryId: "",
      },
      { now },
    );
    const again = await handleLinkRequest(
      allowlist,
      {
        method: "POST",
        route: "add",
        body: JSON.stringify({
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        }),
        entryId: "",
      },
      { now },
    );
    expect(again.status).toBe(409);
    expect(again.changed).toBe(false);
    expect(allowlist.list()).toHaveLength(1);
  });

  it("keeps the row when title lookup fails", async () => {
    const allowlist = repo();
    const added = await handleLinkRequest(
      allowlist,
      {
        method: "POST",
        route: "add",
        body: JSON.stringify({ url: "https://youtu.be/dQw4w9WgXcQ" }),
        entryId: "",
      },
      {
        now,
        lookup: async () => {
          throw new Error("offline");
        },
      },
    );
    expect(added.status).toBe(201);
    expect(allowlist.list()[0]?.title).toBe("dQw4w9WgXcQ");
  });

  it("removes a link and reports a missing one", async () => {
    const allowlist = repo();
    allowlist.upsert({
      id: "PLcatalog",
      kind: "Playlist",
      title: "Little Bear",
      thumbnailUrl: null,
      embeddable: null,
      source: "Catalog",
      addedAtWallMs: now,
      lastProbedWallMs: null,
    });
    const listed = await handleLinkRequest(
      allowlist,
      { method: "GET", route: "list", body: "", entryId: "" },
      { now },
    );
    expect(JSON.parse(listed.body).links[0].url).toBe(
      "https://www.youtube.com/playlist?list=PLcatalog",
    );

    const removed = await handleLinkRequest(
      allowlist,
      { method: "DELETE", route: "remove", body: "", entryId: "PLcatalog" },
      { now },
    );
    expect(removed.status).toBe(200);
    expect(removed.changed).toBe(true);
    expect(allowlist.list()).toEqual([]);

    const missing = await handleLinkRequest(
      allowlist,
      { method: "DELETE", route: "remove", body: "", entryId: "PLcatalog" },
      { now },
    );
    expect(missing.status).toBe(404);
  });
});

function seed(allowlist: AllowlistRepository, id: string, title: string) {
  allowlist.upsert({
    id,
    kind: "Video",
    title,
    thumbnailUrl: null,
    embeddable: null,
    source: "ManualUrl",
    addedAtWallMs: now,
    lastProbedWallMs: null,
  });
}

function policyError(watchMin: number, restMin: number): string | null {
  const bad = validatePolicy({
    watchDurationMs: watchMin * 60_000,
    restDurationMs: restMin * 60_000,
  });
  return bad ? `Invalid ${bad.field}` : null;
}

function actions(snapshot: PhoneSnapshot, extra: Partial<PhoneActions> = {}): PhoneActions {
  return {
    snapshot: () => snapshot,
    tune: async () => {},
    saveCursor: () => {},
    changePolicy: policyError,
    ...extra,
  };
}

describe("phone remote", () => {
  it("returns the link list with the current channel and timers", async () => {
    const allowlist = repo();
    seed(allowlist, "dQw4w9WgXcQ", "Sample");
    const listed = await handlePhoneRequest(
      allowlist,
      { method: "GET", route: "remote", body: "", entryId: "" },
      { now },
      actions({
        phase: "Playing",
        watchMin: 15,
        restMin: 30,
        remainingMs: 120_000,
        currentId: "dQw4w9WgXcQ",
      }),
    );
    expect(listed.status).toBe(200);
    expect(JSON.parse(listed.body)).toEqual({
      links: [
        {
          id: "dQw4w9WgXcQ",
          kind: "Video",
          title: "Sample",
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        },
      ],
      currentId: "dQw4w9WgXcQ",
      phase: "Playing",
      watchMin: 15,
      restMin: 30,
      remainingMs: 120_000,
    });
  });

  it("rejects a channel id that is not in the list", async () => {
    const allowlist = repo();
    seed(allowlist, "dQw4w9WgXcQ", "Sample");
    const tune = vi.fn(async () => {});
    const saveCursor = vi.fn();
    const rejected = await handlePhoneRequest(
      allowlist,
      {
        method: "PUT",
        route: "now",
        body: JSON.stringify({ id: "missing" }),
        entryId: "",
      },
      { now },
      actions(
        {
          phase: "Playing",
          watchMin: 15,
          restMin: 30,
          remainingMs: 0,
          currentId: "dQw4w9WgXcQ",
        },
        { tune, saveCursor },
      ),
    );
    expect(rejected.status).toBe(404);
    expect(tune).not.toHaveBeenCalled();
    expect(saveCursor).not.toHaveBeenCalled();
  });

  it("tunes while a show is on and saves the cursor otherwise", async () => {
    const allowlist = repo();
    seed(allowlist, "dQw4w9WgXcQ", "Sample");
    const tune = vi.fn(async () => {});
    const saveCursor = vi.fn();
    const playing = {
      phase: "Playing" as const,
      watchMin: 15,
      restMin: 30,
      remainingMs: 0,
      currentId: null,
    };
    const tuned = await handlePhoneRequest(
      allowlist,
      {
        method: "PUT",
        route: "now",
        body: JSON.stringify({ id: "dQw4w9WgXcQ" }),
        entryId: "",
      },
      { now },
      actions(playing, { tune, saveCursor }),
    );
    expect(tuned.status).toBe(200);
    expect(JSON.parse(tuned.body)).toEqual({ id: "dQw4w9WgXcQ" });
    expect(tune).toHaveBeenCalledWith("dQw4w9WgXcQ");
    expect(saveCursor).not.toHaveBeenCalled();

    const resting = await handlePhoneRequest(
      allowlist,
      {
        method: "PUT",
        route: "now",
        body: JSON.stringify({ id: "dQw4w9WgXcQ" }),
        entryId: "",
      },
      { now },
      actions({ ...playing, phase: "Resting" }, { tune, saveCursor }),
    );
    expect(resting.status).toBe(200);
    expect(saveCursor).toHaveBeenCalledWith("dQw4w9WgXcQ");
    expect(tune).toHaveBeenCalledTimes(1);
  });

  it("returns the timer bounds error and accepts an in-range policy", async () => {
    const allowlist = repo();
    const request = (watchMin: number, restMin: number) =>
      handlePhoneRequest(
        allowlist,
        {
          method: "PUT",
          route: "timer",
          body: JSON.stringify({ watchMin, restMin }),
          entryId: "",
        },
        { now },
        actions({
          phase: "AwaitingConfirmation",
          watchMin: 15,
          restMin: 30,
          remainingMs: 0,
          currentId: null,
        }),
      );

    const watch = await request(0, 30);
    expect(watch.status).toBe(400);
    expect(JSON.parse(watch.body).error).toBe("Invalid watchDurationMs");

    const rest = await request(15, 181);
    expect(rest.status).toBe(400);
    expect(JSON.parse(rest.body).error).toBe("Invalid restDurationMs");

    const ok = await request(20, 45);
    expect(ok.status).toBe(200);
    expect(JSON.parse(ok.body)).toEqual({ watchMin: 20, restMin: 45 });
  });

  it("uses the live channel while playing and the cursor otherwise", () => {
    expect(phoneChannelId("Playing", "live", "cursor")).toBe("live");
    expect(phoneChannelId("Resting", "live", "cursor")).toBe("cursor");
    expect(phoneChannelId("AwaitingConfirmation", "live", null)).toBe("live");
    expect(phoneChannelId("Setup", null, null)).toBeNull();
  });
});
