export type AuthErrorKind =
  | "AuthDeviceCodeExpired"
  | "AuthDenied"
  | "AuthRevoked"
  | "AuthExpired"
  | "AuthCancelled"
  | "AuthConfigMissing"
  | "AuthSecureStoreUnavailable";

export type AuthError = { kind: AuthErrorKind; message: string };

export type DeviceCodeResponse = {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  interval: number;
};

export type TokenSuccess = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
};

export type PollResult =
  | { status: "pending" }
  | { status: "slow_down" }
  | { status: "success"; tokens: TokenSuccess }
  | { status: "error"; error: AuthError };

const SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
const DEVICE_CODE_URL = "https://oauth2.googleapis.com/device/code";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export type YoutubeOAuthConfig = {
  clientId: string;
  clientSecret: string;
};

export type FetchLike = typeof fetch;

export async function requestDeviceCode(
  config: YoutubeOAuthConfig,
  fetchImpl: FetchLike = fetch,
): Promise<DeviceCodeResponse | AuthError> {
  if (!config.clientId) {
    return {
      kind: "AuthConfigMissing",
      message: "YOUTUBE_CLIENT_ID is not configured",
    };
  }
  const body = new URLSearchParams({
    client_id: config.clientId,
    scope: SCOPE,
  });
  const res = await fetchImpl(DEVICE_CODE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    return {
      kind: "AuthConfigMissing",
      message: `device/code HTTP ${res.status}`,
    };
  }
  const json = (await res.json()) as Record<string, unknown>;
  return {
    deviceCode: String(json.device_code),
    userCode: String(json.user_code),
    verificationUrl: String(
      json.verification_uri_complete ??
        json.verification_url ??
        json.verification_uri ??
        "https://www.google.com/device",
    ),
    expiresIn: Number(json.expires_in),
    interval: Number(json.interval ?? 5),
  };
}

export async function pollDeviceToken(
  config: YoutubeOAuthConfig,
  deviceCode: string,
  fetchImpl: FetchLike = fetch,
): Promise<PollResult> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    device_code: deviceCode,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  });
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (res.ok && json.access_token) {
    return {
      status: "success",
      tokens: {
        accessToken: String(json.access_token),
        refreshToken: String(json.refresh_token ?? ""),
        expiresIn: Number(json.expires_in ?? 3600),
        tokenType: String(json.token_type ?? "Bearer"),
      },
    };
  }
  const err = String(json.error ?? "");
  if (err === "authorization_pending") return { status: "pending" };
  if (err === "slow_down") return { status: "slow_down" };
  if (err === "expired_token") {
    return {
      status: "error",
      error: {
        kind: "AuthDeviceCodeExpired",
        message: "The code expired. Generate a new one.",
      },
    };
  }
  if (err === "access_denied") {
    return {
      status: "error",
      error: {
        kind: "AuthDenied",
        message: "You cancelled on Google",
      },
    };
  }
  if (err === "invalid_grant" || res.status === 403) {
    return {
      status: "error",
      error: {
        kind: "AuthRevoked",
        message: "Google revoked access. Connect again.",
      },
    };
  }
  return {
    status: "error",
    error: {
      kind: "AuthExpired",
      message: err || `token HTTP ${res.status}`,
    },
  };
}

export async function refreshAccessToken(
  config: YoutubeOAuthConfig,
  refreshToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<TokenSuccess | AuthError> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok || !json.access_token) {
    return {
      kind: res.status === 400 || res.status === 403 ? "AuthRevoked" : "AuthExpired",
      message: String(json.error ?? `refresh HTTP ${res.status}`),
    };
  }
  return {
    accessToken: String(json.access_token),
    refreshToken,
    expiresIn: Number(json.expires_in ?? 3600),
    tokenType: String(json.token_type ?? "Bearer"),
  };
}

export async function revokeTokenBestEffort(
  token: string,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  try {
    await fetchImpl(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
  } catch {
    /* best-effort */
  }
}

export { SCOPE as YOUTUBE_READONLY_SCOPE };
