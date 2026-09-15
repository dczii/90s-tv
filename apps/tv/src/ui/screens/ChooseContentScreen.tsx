import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  CATALOG_TTL_MS,
  classifyVideoProbe,
  parseYoutubeUrl,
  type AllowlistEntry,
} from "@nostalgiabox/core";
import { TvButton } from "../components/TvButton";
import { colors, safe } from "../../theme/tokens";
import type { AllowlistRepository } from "../../data/allowlistRepo";
import {
  fetchPlaylistMetadata,
  fetchVideoMetadata,
  listMyPlaylists,
  listMySubscriptions,
  youtubeConfig,
  type CatalogItem,
  type YoutubeRequestOpts,
} from "../../youtube/client";
import {
  ensureAccessToken,
  refreshAccessTokenOnce,
} from "../../youtube/authSession";
import {
  messageForAllowlistError,
  messageForApiError,
  messageForAuthKind,
  PARENT_COPY,
} from "../../youtube/errors";

type Tab = "playlists" | "subscriptions" | "manual";

type Props = {
  allowlist: AllowlistRepository;
  onSaved: (entries: AllowlistEntry[]) => void;
  onBack?: () => void;
  /** Fired when SecureStore sign-in state may have changed (e.g. AuthRevoked). */
  onAuthChanged?: () => void;
};

export function ChooseContentScreen({
  allowlist,
  onSaved,
  onBack,
  onAuthChanged,
}: Props) {
  const [tab, setTab] = useState<Tab>("manual");
  const [selected, setSelected] = useState<Map<string, AllowlistEntry>>(
    () => new Map(allowlist.list().map((e) => [e.id, e])),
  );
  const [playlists, setPlaylists] = useState<CatalogItem[]>([]);
  const [subs, setSubs] = useState<CatalogItem[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
  const [signedIn, setSignedIn] = useState(false);

  const selectedCount = selected.size;

  const authRetryOpts = useCallback((): YoutubeRequestOpts => {
    const config = youtubeConfig();
    return {
      refreshAccessTokenOnce: async () => {
        const token = await refreshAccessTokenOnce(config);
        if (!token) onAuthChanged?.();
        return token;
      },
    };
  }, [onAuthChanged]);

  const loadCatalogs = useCallback(async () => {
    setCanRetry(false);
    const config = youtubeConfig();
    let access;
    try {
      access = await ensureAccessToken(config);
    } catch {
      setStatus(PARENT_COPY.NetworkDown);
      setCanRetry(true);
      return;
    }
    if (access.status !== "ok") {
      setSignedIn(false);
      setTab("manual");
      if (access.status === "error") {
        setStatus(messageForAuthKind(access.error.kind));
        if (access.error.kind === "NetworkDown") {
          setCanRetry(true);
        } else {
          onAuthChanged?.();
        }
      }
      return;
    }
    setSignedIn(true);
    const token = access.accessToken;
    const now = Date.now();
    const cachedPl = allowlist.getCatalog("playlists");
    if (cachedPl && now - cachedPl.fetchedAtWallMs < CATALOG_TTL_MS) {
      setPlaylists(JSON.parse(cachedPl.payloadJson) as CatalogItem[]);
    }
    const cachedSub = allowlist.getCatalog("subscriptions");
    if (cachedSub && now - cachedSub.fetchedAtWallMs < CATALOG_TTL_MS) {
      setSubs(JSON.parse(cachedSub.payloadJson) as CatalogItem[]);
    }

    const opts = authRetryOpts();
    const pl = await listMyPlaylists(token, config.apiKey, opts);
    if (!("kind" in pl)) {
      setPlaylists(pl);
      allowlist.setCatalog("playlists", JSON.stringify(pl), now);
    } else {
      setStatus(messageForApiError(pl));
      if (pl.kind === "NetworkDown") setCanRetry(true);
      if (pl.kind === "AuthExpired" || pl.kind === "AuthRevoked") {
        setSignedIn(false);
        onAuthChanged?.();
      }
    }

    const su = await listMySubscriptions(token, config.apiKey, opts);
    if (!("kind" in su)) {
      setSubs(su);
      allowlist.setCatalog("subscriptions", JSON.stringify(su), now);
    } else {
      setStatus(messageForApiError(su));
      if (su.kind === "NetworkDown") setCanRetry(true);
      if (su.kind === "AuthExpired" || su.kind === "AuthRevoked") {
        setSignedIn(false);
        onAuthChanged?.();
      }
    }
  }, [allowlist, authRetryOpts, onAuthChanged]);

  useEffect(() => {
    void loadCatalogs();
  }, [loadCatalogs]);

  function toggleCatalogItem(item: CatalogItem, asPlaylist: boolean) {
    setSelected((prev) => {
      const next = new Map(prev);
      const id = asPlaylist ? (item.uploadsPlaylistId ?? item.id) : item.id;
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      next.set(id, {
        id,
        kind: "Playlist",
        title: item.title,
        thumbnailUrl: item.thumbnailUrl,
        embeddable: null,
        source: "Account",
        addedAtWallMs: Date.now(),
        lastProbedWallMs: null,
      });
      return next;
    });
  }

  async function addManual() {
    setStatus(null);
    setCanRetry(false);
    const parsed = parseYoutubeUrl(manualUrl);
    if (!parsed.ok) {
      setStatus(messageForAllowlistError(parsed.error));
      return;
    }
    const config = youtubeConfig();
    const access = await ensureAccessToken(config);
    if (access.status === "error") {
      setStatus(messageForAuthKind(access.error.kind));
      if (access.error.kind === "NetworkDown") {
        setCanRetry(true);
      } else {
        setSignedIn(false);
        onAuthChanged?.();
      }
      // Manual path still works with API key when signed out / soft network
      // on refresh — only hard-stop if we have no api key path below.
    }
    const auth =
      access.status === "ok"
        ? ({ type: "bearer" as const, accessToken: access.accessToken })
        : ({ type: "apiKey" as const });
    const opts = authRetryOpts();

    try {
      if (parsed.value.kind === "Video") {
        const meta = await fetchVideoMetadata(
          [parsed.value.id],
          auth,
          config.apiKey,
          opts,
        );
        if ("kind" in meta) {
          setStatus(messageForApiError(meta));
          if (meta.kind === "NetworkDown") setCanRetry(true);
          return;
        }
        const v = meta[0];
        if (!v) {
          setStatus(PARENT_COPY.Removed);
          return;
        }
        const outcome = classifyVideoProbe({
          videoId: v.id,
          title: v.title,
          thumbnailUrl: v.thumbnailUrl,
          embeddable: v.embeddable,
          privacyStatus: v.privacyStatus,
          ytAgeRestricted: v.ytAgeRestricted,
          regionBlocked: v.regionBlocked,
          missing: v.missing,
        });
        // Keep the row even for definitive skips (YT-03); surface copy now.
        if (outcome.kind === "definitive") {
          setStatus(messageForAllowlistError(outcome.error));
          if (outcome.error.kind === "Removed") {
            return;
          }
        }
        setSelected((prev) => {
          const next = new Map(prev);
          next.set(v.id, {
            id: v.id,
            kind: "Video",
            title: v.title || v.id,
            thumbnailUrl: v.thumbnailUrl,
            embeddable: v.embeddable,
            source: "ManualUrl",
            addedAtWallMs: Date.now(),
            lastProbedWallMs: Date.now(),
          });
          return next;
        });
      } else {
        const meta = await fetchPlaylistMetadata(
          parsed.value.id,
          auth,
          config.apiKey,
          opts,
        );
        if (meta && "kind" in meta) {
          setStatus(messageForApiError(meta));
          if (meta.kind === "NetworkDown") setCanRetry(true);
          return;
        }
        if (!meta) {
          setStatus(PARENT_COPY.Removed);
          return;
        }
        setSelected((prev) => {
          const next = new Map(prev);
          next.set(meta.id, {
            id: meta.id,
            kind: "Playlist",
            title: meta.title,
            thumbnailUrl: meta.thumbnailUrl,
            embeddable: null,
            source: "ManualUrl",
            addedAtWallMs: Date.now(),
            lastProbedWallMs: null,
          });
          return next;
        });
      }
      setManualUrl("");
    } catch {
      setStatus(PARENT_COPY.NetworkDown);
      setCanRetry(true);
    }
  }

  const rows = useMemo(() => {
    if (tab === "playlists") return playlists;
    if (tab === "subscriptions") return subs;
    return [...selected.values()].filter((e) => e.source === "ManualUrl");
  }, [tab, playlists, subs, selected]);

  return (
    <View style={styles.shell} accessibilityLabel="Choose allowed content">
      <Text style={styles.title}>Choose allowed content</Text>
      <View style={styles.tabs}>
        {(
          [
            ["playlists", "Playlists"],
            ["subscriptions", "Subscriptions"],
            ["manual", "Manual link"],
          ] as const
        ).map(([id, label]) => (
          <Pressable
            key={id}
            onPress={() => setTab(id)}
            style={({ focused }) => [
              styles.tab,
              tab === id && styles.tabActive,
              focused && styles.focused,
            ]}
          >
            <Text style={styles.tabLabel}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {!signedIn && tab !== "manual" ? (
        <Text style={styles.note}>
          Connect a YouTube account to browse playlists and subscriptions, or
          use Manual link.
        </Text>
      ) : null}
      {tab === "manual" ? (
        <View style={styles.manualRow}>
          <TextInput
            value={manualUrl}
            onChangeText={setManualUrl}
            placeholder="Paste a YouTube video or playlist URL"
            placeholderTextColor={colors.slateMuted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TvButton label="Add link" onPress={() => { void addManual(); }} />
        </View>
      ) : null}
      <ScrollView style={styles.list}>
        {tab === "manual"
          ? [...selected.values()].map((entry) => (
              <Pressable
                key={entry.id}
                onPress={() =>
                  setSelected((prev) => {
                    const next = new Map(prev);
                    next.delete(entry.id);
                    return next;
                  })
                }
                style={({ focused }) => [styles.row, focused && styles.focused]}
              >
                {entry.thumbnailUrl ? (
                  <Image source={{ uri: entry.thumbnailUrl }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]} />
                )}
                <Text style={styles.rowTitle}>{entry.title}</Text>
                <Text style={styles.check}>✓</Text>
              </Pressable>
            ))
          : rows.map((item) => {
              const id =
                tab === "subscriptions"
                  ? (item as CatalogItem).uploadsPlaylistId ?? item.id
                  : item.id;
              const checked = selected.has(id);
              return (
                <Pressable
                  key={item.id}
                  onPress={() =>
                    toggleCatalogItem(
                      item as CatalogItem,
                      tab !== "playlists"
                        ? tab === "subscriptions"
                        : true,
                    )
                  }
                  style={({ focused }) => [styles.row, focused && styles.focused]}
                >
                  {item.thumbnailUrl ? (
                    <Image source={{ uri: item.thumbnailUrl }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]} />
                  )}
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.check}>{checked ? "✓" : ""}</Text>
                </Pressable>
              );
            })}
      </ScrollView>
      <Text style={styles.count}>{selectedCount} selected</Text>
      {status ? <Text style={styles.error}>{status}</Text> : null}
      {canRetry ? (
        <TvButton
          label="Retry"
          variant="secondary"
          onPress={() => {
            void loadCatalogs();
          }}
        />
      ) : null}
      <TvButton
        label="Save allowed content"
        onPress={() => {
          const entries = [...selected.values()];
          allowlist.replaceAll(entries);
          onSaved(entries);
        }}
      />
      {onBack ? (
        <TvButton label="Back" variant="secondary" onPress={onBack} />
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
    gap: 12,
  },
  title: { color: colors.offWhite, fontSize: 40, fontWeight: "700" },
  tabs: { flexDirection: "row", gap: 12 },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: colors.slate,
    borderWidth: 3,
    borderColor: "transparent",
  },
  tabActive: { borderColor: colors.coral },
  tabLabel: { color: colors.offWhite, fontSize: 22, fontWeight: "600" },
  focused: { borderColor: colors.offWhite },
  list: { flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 10,
    borderWidth: 3,
    borderColor: "transparent",
    borderRadius: 8,
  },
  thumb: { width: 120, height: 68, borderRadius: 6, backgroundColor: colors.slate },
  thumbEmpty: { opacity: 0.5 },
  rowTitle: { flex: 1, color: colors.offWhite, fontSize: 24 },
  check: { color: colors.coral, fontSize: 28, width: 32 },
  count: { color: colors.offWhite, fontSize: 24 },
  note: { color: colors.slateMuted, fontSize: 20 },
  error: { color: colors.amber, fontSize: 20 },
  manualRow: { gap: 12 },
  input: {
    backgroundColor: colors.slate,
    color: colors.offWhite,
    fontSize: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
  },
});
