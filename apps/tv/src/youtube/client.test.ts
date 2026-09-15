import { describe, expect, it, vi } from "vitest";
import { listMyPlaylists } from "./client";

vi.mock("android-identity", () => ({
  androidPackageName: () => "com.littleplay.tv",
  signingCertSha1Hex: () => "abc",
}));

vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: {} } },
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Data API client", () => {
  it("maps network throw to NetworkDown", async () => {
    const result = await listMyPlaylists("tok", "key", {
      fetchImpl: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    expect(result).toMatchObject({ kind: "NetworkDown" });
  });

  it("401 then refresh once then succeeds", async () => {
    let n = 0;
    const refresh = vi.fn(async () => "new-tok");
    const result = await listMyPlaylists("old", "key", {
      refreshAccessTokenOnce: refresh,
      fetchImpl: async (_url, init) => {
        n += 1;
        const auth = (init as RequestInit | undefined)?.headers as
          | Record<string, string>
          | undefined;
        if (n === 1) {
          expect(auth?.Authorization).toBe("Bearer old");
          return jsonResponse(401, { error: { message: "Unauthorized" } });
        }
        expect(auth?.Authorization).toBe("Bearer new-tok");
        return jsonResponse(200, {
          items: [
            {
              id: "PL1",
              snippet: { title: "Kids", thumbnails: {} },
            },
          ],
        });
      },
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      { id: "PL1", title: "Kids", thumbnailUrl: null },
    ]);
  });

  it("401 with failed refresh → AuthExpired (no loop)", async () => {
    const refresh = vi.fn(async () => null);
    let calls = 0;
    const result = await listMyPlaylists("old", "key", {
      refreshAccessTokenOnce: refresh,
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse(401, {});
      },
    });
    expect(calls).toBe(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ kind: "AuthExpired" });
  });
});
