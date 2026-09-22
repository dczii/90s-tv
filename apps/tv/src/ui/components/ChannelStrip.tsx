import { StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeInDown,
  FadeOutDown,
  useReducedMotion,
} from "react-native-reanimated";
import {
  formatChannelNumber,
  type PlaybackChannel,
} from "../../player/channels";
import { colors, useLayout } from "../../theme/tokens";
import { duration, EASE_OUT } from "../../theme/motion";

type Props = {
  channels: readonly PlaybackChannel[];
  activeEntryId: string | null;
  visible: boolean;
};

export function ChannelStrip({ channels, activeEntryId, visible }: Props) {
  const { s, safeX, safeY } = useLayout();
  const reduced = useReducedMotion();
  if (!visible || channels.length === 0) return null;

  const active =
    channels.find((channel) => channel.entryId === activeEntryId) ??
    channels[0]!;

  return (
    <Animated.View
      entering={
        reduced ? undefined : FadeInDown.duration(duration.fast).easing(EASE_OUT)
      }
      exiting={
        reduced ? undefined : FadeOutDown.duration(duration.press).easing(EASE_OUT)
      }
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          left: safeX,
          right: safeX,
          bottom: safeY,
          borderRadius: s(24),
          padding: s(20),
          gap: s(12),
        },
      ]}
    >
      <Text style={[styles.eyebrow, { fontSize: s(16) }]}>
        CHANNEL {formatChannelNumber(active.number)}
      </Text>
      <Text style={[styles.title, { fontSize: s(32) }]} numberOfLines={1}>
        {active.title}
      </Text>
      <View style={[styles.row, { gap: s(12) }]}>
        {channels.map((channel) => {
          const on = channel.entryId === active.entryId;
          return (
            <View
              key={channel.entryId}
              style={[
                styles.chip,
                {
                  borderRadius: s(16),
                  paddingVertical: s(12),
                  paddingHorizontal: s(14),
                  gap: s(4),
                  borderColor: on ? colors.coral : colors.white10,
                  backgroundColor: on ? colors.panel2 : colors.panel,
                },
              ]}
            >
              <Text style={[styles.chipNumber, { fontSize: s(16) }]}>
                {formatChannelNumber(channel.number)}
              </Text>
              <Text
                style={[styles.chipTitle, { fontSize: s(18) }]}
                numberOfLines={1}
              >
                {channel.title}
              </Text>
            </View>
          );
        })}
      </View>
      {channels.length > 1 ? (
        <Text style={[styles.hint, { fontSize: s(16) }]}>
          Left or right changes the channel
        </Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    backgroundColor: "rgba(10,16,28,0.87)",
  },
  eyebrow: {
    color: colors.amber,
    fontWeight: "700",
    letterSpacing: 1,
  },
  title: { color: colors.offWhite, fontWeight: "700" },
  row: { flexDirection: "row" },
  chip: {
    flex: 1,
    minWidth: 0,
    borderWidth: 3,
  },
  chipNumber: { color: colors.amber, fontWeight: "700" },
  chipTitle: { color: colors.offWhite, fontWeight: "600" },
  hint: { color: colors.muted, fontWeight: "500" },
});
