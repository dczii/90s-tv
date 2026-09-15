import { useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { AllowlistEntry } from "@littleplay/core";
import { TvButton } from "../components/TvButton";
import { colors, safe } from "../../theme/tokens";
import type { AllowlistRepository } from "../../data/allowlistRepo";
import { PRESET_PLAYLISTS } from "../../content/presetPlaylists";

type Props = {
  allowlist: AllowlistRepository;
  onSaved: (entries: AllowlistEntry[]) => void;
  onBack?: () => void;
};

export function ChooseContentScreen({ allowlist, onSaved, onBack }: Props) {
  const [selected, setSelected] = useState<Map<string, AllowlistEntry>>(
    () => new Map(allowlist.list().map((e) => [e.id, e])),
  );

  function togglePreset(id: string) {
    const preset = PRESET_PLAYLISTS.find((p) => p.id === id);
    if (!preset) return;

    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      next.set(id, {
        id: preset.id,
        kind: preset.kind,
        title: preset.title,
        thumbnailUrl: preset.thumbnailUrl,
        embeddable: preset.kind === "Video" ? true : null,
        source: "Catalog",
        addedAtWallMs: Date.now(),
        lastProbedWallMs: null,
      });
      return next;
    });
  }

  return (
    <View style={styles.shell} accessibilityLabel="Choose playlists">
      <Text style={styles.title}>Choose playlists</Text>
      <Text style={styles.note}>
        Pick one or more shows. No YouTube sign-in needed.
      </Text>
      <ScrollView style={styles.list}>
        {PRESET_PLAYLISTS.map((item) => {
          const checked = selected.has(item.id);
          return (
            <Pressable
              key={item.id}
              onPress={() => togglePreset(item.id)}
              style={({ focused }) => [styles.row, focused && styles.focused]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={item.title}
            >
              {item.thumbnailUrl ? (
                <Image source={{ uri: item.thumbnailUrl }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]} />
              )}
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowSub}>{item.description}</Text>
              </View>
              <Text style={styles.check}>{checked ? "✓" : ""}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.count}>{selected.size} selected</Text>
      <TvButton
        label="Save playlists"
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
  note: { color: colors.slateMuted, fontSize: 20 },
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
  focused: { borderColor: colors.offWhite },
  thumb: {
    width: 120,
    height: 68,
    borderRadius: 6,
    backgroundColor: colors.slate,
  },
  thumbEmpty: { opacity: 0.5 },
  rowText: { flex: 1, gap: 4 },
  rowTitle: { color: colors.offWhite, fontSize: 24 },
  rowSub: { color: colors.slateMuted, fontSize: 18 },
  check: { color: colors.coral, fontSize: 28, width: 32 },
  count: { color: colors.offWhite, fontSize: 24 },
});
