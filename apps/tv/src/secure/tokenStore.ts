import * as SecureStore from "expo-secure-store";

const KEYS = {
  accessToken: "access_token",
  refreshToken: "refresh_token",
  accessExpiryWallMs: "access_expiry_wall_ms",
  tokenType: "token_type",
} as const;

export type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  accessExpiryWallMs: number;
  tokenType: string;
};

export async function loadTokens(): Promise<StoredTokens | null> {
  try {
    const accessToken = await SecureStore.getItemAsync(KEYS.accessToken);
    const refreshToken = await SecureStore.getItemAsync(KEYS.refreshToken);
    const expiry = await SecureStore.getItemAsync(KEYS.accessExpiryWallMs);
    const tokenType = await SecureStore.getItemAsync(KEYS.tokenType);
    if (!accessToken || !refreshToken || !expiry) return null;
    return {
      accessToken,
      refreshToken,
      accessExpiryWallMs: Number(expiry),
      tokenType: tokenType ?? "Bearer",
    };
  } catch {
    return null;
  }
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  await SecureStore.setItemAsync(KEYS.accessToken, tokens.accessToken);
  await SecureStore.setItemAsync(KEYS.refreshToken, tokens.refreshToken);
  await SecureStore.setItemAsync(
    KEYS.accessExpiryWallMs,
    String(tokens.accessExpiryWallMs),
  );
  await SecureStore.setItemAsync(KEYS.tokenType, tokens.tokenType);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.accessToken);
  await SecureStore.deleteItemAsync(KEYS.refreshToken);
  await SecureStore.deleteItemAsync(KEYS.accessExpiryWallMs);
  await SecureStore.deleteItemAsync(KEYS.tokenType);
}

export async function hasStoredTokens(): Promise<boolean> {
  const t = await loadTokens();
  return t != null;
}
