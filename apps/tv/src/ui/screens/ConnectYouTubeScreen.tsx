import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { TvButton } from "../components/TvButton";
import { colors, safe } from "../../theme/tokens";
import { youtubeConfig } from "../../youtube/client";
import {
  pollDeviceToken,
  requestDeviceCode,
  revokeTokenBestEffort,
  type DeviceCodeResponse,
} from "../../youtube/deviceCodeAuth";
import {
  clearTokens,
  loadTokens,
  saveTokens,
} from "../../secure/tokenStore";

type Props = {
  onConnected: () => void;
  onUseLinksInstead: () => void;
  onCancel?: () => void;
  /** When true, offer disconnect if already signed in */
  allowDisconnect?: boolean;
  /** Fired after disconnect so session.signedIn stays accurate */
  onAuthChanged?: () => void;
};

export function ConnectYouTubeScreen({
  onConnected,
  onUseLinksInstead,
  onCancel,
  allowDisconnect,
  onAuthChanged,
}: Props) {
  const [code, setCode] = useState<DeviceCodeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const cancelled = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    cancelled.current = true;
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }, []);

  const startFlow = useCallback(async () => {
    stopPolling();
    cancelled.current = false;
    setError(null);
    setBusy(true);
    const config = youtubeConfig();
    const started = await requestDeviceCode(config);
    setBusy(false);
    if ("kind" in started) {
      setError(started.message);
      return;
    }
    setCode(started);
    let intervalMs = started.interval * 1000;

    const tick = async () => {
      if (cancelled.current) return;
      const result = await pollDeviceToken(config, started.deviceCode);
      if (cancelled.current) return;
      if (result.status === "pending") {
        pollTimer.current = setTimeout(() => {
          void tick();
        }, intervalMs);
        return;
      }
      if (result.status === "slow_down") {
        intervalMs += 5000;
        pollTimer.current = setTimeout(() => {
          void tick();
        }, intervalMs);
        return;
      }
      if (result.status === "error") {
        setError(result.error.message);
        setCode(null);
        return;
      }
      try {
        await saveTokens({
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          accessExpiryWallMs: Date.now() + result.tokens.expiresIn * 1000,
          tokenType: result.tokens.tokenType,
        });
        setSignedIn(true);
        onConnected();
      } catch {
        setError("cannot store Google sign-in on this device");
      }
    };
    pollTimer.current = setTimeout(() => {
      void tick();
    }, intervalMs);
  }, [onConnected, stopPolling]);

  useEffect(() => {
    void loadTokens().then((t) => {
      if (t) {
        setSignedIn(true);
        if (!allowDisconnect) {
          // Wizard path: tokens already present — skip user-code screen.
          onConnected();
        }
      } else {
        void startFlow();
      }
    });
    return () => stopPolling();
    // intentionally once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function disconnect() {
    const tokens = await loadTokens();
    if (tokens) await revokeTokenBestEffort(tokens.accessToken);
    await clearTokens();
    setSignedIn(false);
    setCode(null);
    onAuthChanged?.();
    void startFlow();
  }

  return (
    <View style={styles.shell} accessibilityLabel="Connect YouTube">
      <Text style={styles.title}>Connect YouTube</Text>
      <Text style={styles.body}>
        Read-only access to playlists and subscriptions. This app never uploads
        or changes your YouTube account.
      </Text>
      {signedIn && allowDisconnect ? (
        <>
          <Text style={styles.code}>Signed in</Text>
          <TvButton label="Disconnect account" variant="destructive" onPress={() => { void disconnect(); }} />
          <TvButton label="Continue" onPress={onConnected} />
        </>
      ) : (
        <>
          {busy ? <ActivityIndicator color={colors.coral} size="large" /> : null}
          {code ? (
            <>
              <Text style={styles.code}>{code.userCode}</Text>
              <Text style={styles.url}>{code.verificationUrl}</Text>
              <View style={styles.qr}>
                <QRCode value={code.verificationUrl} size={180} backgroundColor={colors.offWhite} />
              </View>
            </>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TvButton
            label="Generate new code"
            variant="secondary"
            onPress={() => {
              void startFlow();
            }}
          />
        </>
      )}
      <TvButton label="Use links instead" variant="secondary" onPress={onUseLinksInstead} />
      {onCancel ? (
        <TvButton label="Back" variant="secondary" onPress={onCancel} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.navy,
    paddingHorizontal: safe.horizontal,
    paddingVertical: safe.vertical,
    justifyContent: "center",
    gap: 16,
  },
  title: { color: colors.offWhite, fontSize: 42, fontWeight: "700" },
  body: { color: colors.offWhite, fontSize: 24, maxWidth: 1100, lineHeight: 34 },
  code: {
    color: colors.coral,
    fontSize: 64,
    fontWeight: "700",
    letterSpacing: 4,
  },
  url: { color: colors.offWhite, fontSize: 26 },
  qr: {
    alignSelf: "flex-start",
    padding: 12,
    backgroundColor: colors.offWhite,
    borderRadius: 8,
  },
  error: { color: colors.amber, fontSize: 22 },
});
