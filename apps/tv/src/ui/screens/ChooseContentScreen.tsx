import { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { AllowlistEntry } from "@littleplay/core";
import { TvButton } from "../components/TvButton";
import { ScreenHeader, ScreenShell } from "../components/ScreenChrome";
import { colors, useLayout } from "../../theme/tokens";
import { duration, EASE_OUT, popScaleFrom } from "../../theme/motion";
import { usePressScale } from "../motion/usePressScale";
import type { AllowlistRepository } from "../../data/allowlistRepo";
import { PRESET_PLAYLISTS } from "../../content/presetPlaylists";

function posterUrl(url: string): string {
  return url.replace("/hqdefault.jpg", "/mqdefault.jpg");
}

type Props = {
  allowlist: AllowlistRepository;
  onSaved: (entries: AllowlistEntry[]) => void;
  onBack?: () => void;
  mode?: "wizard" | "manage";
};

function CheckBadge({
  size,
  fontSize,
  top,
  right,
}: {
  size: number;
  fontSize: number;
  top: number;
  right: number;
}) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(reduced ? 1 : popScaleFrom);
  const opacity = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    opacity.set(
      withTiming(1, { duration: duration.fast, easing: EASE_OUT }),
    );
    if (!reduced) {
      scale.set(
        withTiming(1, { duration: duration.fast, easing: EASE_OUT }),
      );
    }
  }, [opacity, reduced, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ scale: scale.get() }],
  }));

  return (
    <Animated.View
      style={[
        styles.check,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          top,
          right,
        },
        animatedStyle,
      ]}
    >
      <Text style={{ color: colors.navy, fontSize, fontWeight: "700" }}>✓</Text>
    </Animated.View>
  );
}

function PlaylistCard({
  title,
  description,
  thumbnailUrl,
  checked,
  onPress,
  preferFocus,
  s,
}: {
  title: string;
  description: string;
  thumbnailUrl: string | null;
  checked: boolean;
  onPress: () => void;
  preferFocus?: boolean;
  s: (n: number) => number;
}) {
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      {...(preferFocus ? ({ hasTVPreferredFocus: true } as object) : {})}
      style={({ focused }) => [
        styles.card,
        {
          borderRadius: s(20),
          padding: s(12),
          borderWidth: checked || focused ? 4 : 1,
          borderColor: checked || focused ? colors.coral : colors.white10,
        },
      ]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={title}
    >
      <Animated.View style={[styles.cardInner, animatedStyle]}>
        <View style={[styles.thumbWrap, { borderRadius: s(14) }]}>
          {thumbnailUrl ? (
            <Image
              source={{ uri: posterUrl(thumbnailUrl) }}
              style={styles.thumb}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.thumb, styles.thumbEmpty]} />
          )}
          {checked ? (
            <CheckBadge
              size={s(32)}
              fontSize={s(18)}
              top={s(10)}
              right={s(10)}
            />
          ) : null}
        </View>
        <Text style={[styles.cardTitle, { fontSize: s(20) }]} numberOfLines={2}>
          {title}
        </Text>
        <Text style={[styles.cardSub, { fontSize: s(15) }]} numberOfLines={1}>
          {description}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function ChooseContentScreen({
  allowlist,
  onSaved,
  onBack,
  mode = "wizard",
}: Props) {
  const { s } = useLayout();
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

  const managing = mode === "manage";

  return (
    <ScreenShell
      accessibilityLabel={managing ? "Manage playlists" : "Choose playlists"}
    >
      <ScreenHeader
        section={managing ? "Parent settings" : "Content setup"}
        title={managing ? "Manage playlists" : "Choose playlists"}
        subtitle="Pick one or more shows. No YouTube sign-in needed."
      />
      <View style={[styles.grid, { gap: s(16), marginTop: s(16) }]}>
        {PRESET_PLAYLISTS.map((item, index) => (
          <PlaylistCard
            key={item.id}
            title={item.title}
            description={item.description}
            thumbnailUrl={item.thumbnailUrl}
            checked={selected.has(item.id)}
            onPress={() => togglePreset(item.id)}
            preferFocus={index === 0}
            s={s}
          />
        ))}
      </View>
      <View style={styles.footer}>
        <View style={styles.footerMeta}>
          {onBack ? (
            <TvButton label="Back" variant="secondary" onPress={onBack} />
          ) : null}
          <Text style={[styles.count, { fontSize: s(22) }]}>
            {selected.size} playlist{selected.size === 1 ? "" : "s"} selected
          </Text>
        </View>
        <TvButton
          label="Save playlists"
          disabled={selected.size === 0}
          onPress={() => {
            const entries = [...selected.values()];
            allowlist.replaceAll(entries);
            onSaved(entries);
          }}
        />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  grid: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    minHeight: 0,
    alignContent: "flex-start",
  },
  card: {
    width: "23.5%",
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: colors.panel,
  },
  cardInner: {
    gap: 8,
  },
  thumbWrap: {
    width: "100%",
    aspectRatio: 16 / 9,
    overflow: "hidden",
    backgroundColor: colors.panel2,
  },
  thumb: { width: "100%", height: "100%" },
  thumbEmpty: { opacity: 0.5 },
  check: {
    position: "absolute",
    backgroundColor: colors.coral,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { color: colors.offWhite, fontWeight: "700" },
  cardSub: { color: colors.muted, fontWeight: "500" },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "auto",
    flexShrink: 0,
    gap: 16,
    paddingTop: 12,
  },
  footerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    flexShrink: 1,
  },
  count: { color: colors.offWhite, fontWeight: "600" },
});
