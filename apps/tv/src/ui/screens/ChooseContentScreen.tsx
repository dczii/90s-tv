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
} from "../../youtube/client";
import { loadTokens, saveTokens } from "../../secure/tokenStore";
import {
  refreshAccessToken,
  type YoutubeOAuthConfig,
} from "../../youtube/deviceCodeAuth";

type Tab = "playlists" | "subscriptions" | "manual";

type Props = {
  allowlist: AllowlistRepository;
  onSaved: (entries: AllowlistEntry[]) => void;
  onBack?: () => void;
};

async function authedAccessToken(
  config: YoutubeOAuthConfig,
): Promise<string | null> {
  const tokens = await loadTokens();
  if (!tokens) return null;
  if (tokens.accessExpiryWallMs > Date.now() + 60_000) {
    return tokens.accessToken;
  }
  const refreshed = await refreshAccessToken(config, tokens.refreshToken);
  if ("kind" in refreshed) {
    return null;
  }
  await saveTokens({
    accessToken: refreshed.accessToken,
    refreshToken: tokens.refreshToken,
    accessExpiryWallMs: Date.now() + refreshed.expiresIn * 1000,
    tokenType: refreshed.tokenType,
  });
  return refreshed.accessToken;
}

export function ChooseContentScreen({ allowlist, onSaved, onBack }: Props) {
  const [tab, setTab] = useState<Tab>("manual");
  const [selected, setSelected] = useState<Map<string, AllowlistEntry>>(
    () => new Map(allowlist.list().map((e) => [e.id, e])),
  );
  const [playlists, setPlaylists] = useState<CatalogItem[]>([]);
  const [subs, setSubs] = useState<CatalogItem[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const [signedIn, setSignedIn] = useState(false);

  const selectedCount = selected.size;

  const loadCatalogs = useCallback(async () => {
    const config = youtubeConfig();
    const token = await authedAccessToken(config);
    setSignedIn(Boolean(token));
    if (!token) {
      setTab("manual");
      return;
    }
    const now = Date.now();
    const cachedPl = allowlist.getCatalog("playlists");
    if (cachedPl && now - cachedPl.fetchedAtWallMs < CATALOG_TTL_MS) {
      setPlaylists(JSON.parse(cachedPl.payloadJson) as CatalogItem[]);
    }
    const cachedSub = allowlist.getCatalog("subscriptions");
    if (cachedSub && now - cachedSub.fetchedAtWallMs < CATALOG_TTL_MS) {
      setSubs(JSON.parse(cachedSub.payloadJson) as CatalogItem[]);
    }

    const pl = await listMyPlaylists(token, config.apiKey);
    if (!("kind" in pl)) {
      setPlaylists(pl);
      allowlist.setCatalog("playlists", JSON.stringify(pl), now);
    } else if (pl.kind === "QuotaExceeded") {
      setStatus(pl.message);
    }

    const su = await listMySubscriptions(token, config.apiKey);
    if (!("kind" in su)) {
      setSubs(su);
      allowlist.setCatalog("subscriptions", JSON.stringify(su), now);
    } else if (su.kind === "QuotaExceeded") {
      setStatus(su.message);
    }
  }, [allowlist]);

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
    const parsed = parseYoutubeUrl(manualUrl);
    if (!parsed.ok) {
      setStatus(
        parsed.error.kind === "UnsupportedHost"
          ? "That YouTube link type is not supported. Use a video or playlist URL."
          : "That does not look like a YouTube URL.",
      );
      return;
    }
    const config = youtubeConfig();
    const token = await authedAccessToken(config);
    const auth = token
      ? ({ type: "bearer" as const, accessToken: token })
      : ({ type: "apiKey" as const });

    if (parsed.value.kind === "Video") {
      const meta = await fetchVideoMetadata(
        [parsed.value.id],
        auth,
        config.apiKey,
      );
      if ("kind" in meta) {
        setStatus(meta.message);
        return;
      }
      const v = meta[0];
      if (!v || v.missing) {
        setStatus("That video is no longer available.");
        return;
      }
      setSelected((prev) => {
        const next = new Map(prev);
        next.set(v.id, {
          id: v.id,
          kind: "Video",
          title: v.title,
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
      );
      if (meta && "kind" in meta) {
        setStatus(meta.message);
        return;
      }
      if (!meta) {
        setStatus("That playlist is no longer available.");
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
                    toggleCatalogItem(item as CatalogItem, tab !== "playlists" ? tab === "subscriptions" : true)
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
