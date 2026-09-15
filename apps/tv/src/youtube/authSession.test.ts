import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../secure/tokenStore", () => ({
  loadTokens: vi.fn(),
  saveTokens: vi.fn(),
  clearTokens: vi.fn(),
}));

import { clearTokens, loadTokens, saveTokens } from "../secure/tokenStore";
import { ensureAccessToken } from "./authSession";

const config = { clientId: "c", clientSecret: "s" };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ensureAccessToken", () => {
  beforeEach(() => {
    vi.mocked(loadTokens).mockReset();
    vi.mocked(saveTokens).mockReset();
    vi.mocked(clearTokens).mockReset();
  });

  it("returns signed_out when no tokens", async () => {
    vi.mocked(loadTokens).mockResolvedValue(null);
    await expect(ensureAccessToken(config)).resolves.toEqual({
      status: "signed_out",
    });
  });

  it("returns cached access token when not near expiry", async () => {
    vi.mocked(loadTokens).mockResolvedValue({
      accessToken: "a",
      refreshToken: "r",
      accessExpiryWallMs: Date.now() + 120_000,
      tokenType: "Bearer",
    });
    await expect(ensureAccessToken(config)).resolves.toEqual({
      status: "ok",
      accessToken: "a",
    });
    expect(clearTokens).not.toHaveBeenCalled();
  });

  it("force-disconnects on AuthRevoked refresh without touching allowlist", async () => {
    vi.mocked(loadTokens).mockResolvedValue({
      accessToken: "old",
      refreshToken: "r",
      accessExpiryWallMs: Date.now() - 1,
      tokenType: "Bearer",
    });
    const fetchImpl: typeof fetch = async () =>
      jsonResponse(400, { error: "invalid_grant" });
    const result = await ensureAccessToken(config, { fetchImpl });
    expect(result).toMatchObject({
      status: "error",
      error: { kind: "AuthRevoked" },
    });
    expect(clearTokens).toHaveBeenCalledTimes(1);
    expect(saveTokens).not.toHaveBeenCalled();
  });

  it("keeps tokens on NetworkDown during refresh", async () => {
    vi.mocked(loadTokens).mockResolvedValue({
      accessToken: "old",
      refreshToken: "r",
      accessExpiryWallMs: Date.now() - 1,
      tokenType: "Bearer",
    });
    const fetchImpl: typeof fetch = async () => {
      throw new Error("offline");
    };
    const result = await ensureAccessToken(config, { fetchImpl });
    expect(result).toMatchObject({
      status: "error",
      error: { kind: "NetworkDown" },
    });
    expect(clearTokens).not.toHaveBeenCalled();
  });

  it("persists refreshed tokens", async () => {
    vi.mocked(loadTokens).mockResolvedValue({
      accessToken: "old",
      refreshToken: "r",
      accessExpiryWallMs: Date.now() - 1,
      tokenType: "Bearer",
    });
    const fetchImpl: typeof fetch = async () =>
      jsonResponse(200, {
        access_token: "new",
        expires_in: 3600,
        token_type: "Bearer",
      });
    await expect(ensureAccessToken(config, { fetchImpl })).resolves.toEqual({
      status: "ok",
      accessToken: "new",
    });
    expect(saveTokens).toHaveBeenCalled();
    expect(clearTokens).not.toHaveBeenCalled();
  });

  it("forceRefresh ignores wall-clock and refreshes", async () => {
    vi.mocked(loadTokens).mockResolvedValue({
      accessToken: "old",
      refreshToken: "r",
      accessExpiryWallMs: Date.now() + 120_000,
      tokenType: "Bearer",
    });
    const fetchImpl: typeof fetch = async () =>
      jsonResponse(200, {
        access_token: "fresh",
        expires_in: 3600,
        token_type: "Bearer",
      });
    await expect(
      ensureAccessToken(config, { fetchImpl, forceRefresh: true }),
    ).resolves.toEqual({
      status: "ok",
      accessToken: "fresh",
    });
  });
});
