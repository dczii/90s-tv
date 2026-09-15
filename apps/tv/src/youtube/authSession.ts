import { clearTokens, loadTokens, saveTokens } from "../secure/tokenStore";
import {
  refreshAccessToken,
  type AuthError,
  type YoutubeOAuthConfig,
} from "./deviceCodeAuth";
import { messageForAuthKind } from "./errors";

export type AccessTokenResult =
  | { status: "ok"; accessToken: string }
  | { status: "signed_out" }
  | { status: "error"; error: AuthError };

export type EnsureAccessTokenOpts = {
  fetchImpl?: typeof fetch;
  /** Skip wall-clock check and refresh immediately (Data API 401 path). */
  forceRefresh?: boolean;
};

/**
 * Returns a usable access token, refreshing when near expiry or forced.
 * AuthRevoked / failed refresh: delete SecureStore keys (keep allowlist).
 */
export async function ensureAccessToken(
  config: YoutubeOAuthConfig,
  opts: EnsureAccessTokenOpts = {},
): Promise<AccessTokenResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const tokens = await loadTokens();
  if (!tokens) return { status: "signed_out" };

  if (
    !opts.forceRefresh &&
    tokens.accessExpiryWallMs > Date.now() + 60_000
  ) {
    return { status: "ok", accessToken: tokens.accessToken };
  }

  const refreshed = await refreshAccessToken(
    config,
    tokens.refreshToken,
    fetchImpl,
  );
  if ("kind" in refreshed) {
    // Soft transport failures keep tokens so Manual / retry still work.
    if (refreshed.kind === "NetworkDown") {
      return {
        status: "error",
        error: {
          ...refreshed,
          message: messageForAuthKind(refreshed.kind),
        },
      };
    }
    // AuthRevoked / AuthExpired: force disconnect; allowlist stays in sqlite.
    await clearTokens();
    return {
      status: "error",
      error: {
        ...refreshed,
        message: messageForAuthKind(refreshed.kind),
      },
    };
  }

  await saveTokens({
    accessToken: refreshed.accessToken,
    refreshToken: tokens.refreshToken,
    accessExpiryWallMs: Date.now() + refreshed.expiresIn * 1000,
    tokenType: refreshed.tokenType,
  });
  return { status: "ok", accessToken: refreshed.accessToken };
}

/** 401 retry helper: force-refresh once; null if signed out or revoked. */
export async function refreshAccessTokenOnce(
  config: YoutubeOAuthConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const result = await ensureAccessToken(config, {
    fetchImpl,
    forceRefresh: true,
  });
  return result.status === "ok" ? result.accessToken : null;
}
