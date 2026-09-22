import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { colors, useLayout } from "../../theme/tokens";
import { usePressScale } from "../motion/usePressScale";

type Props = {
  label: string;
  valueMinutes: number;
  min: number;
  max: number;
  step?: number;
  /** Amber for watch, green for break — matches pen design. */
  tone?: "watch" | "break";
  focusedCard?: boolean;
  onChange: (next: number) => void;
};

function StepButton({
  label,
  onPress,
  focusedCard,
  plus,
  size,
  radius,
  fontSize,
}: {
  label: string;
  onPress: () => void;
  focusedCard?: boolean;
  plus?: boolean;
  size: number;
  radius: number;
  fontSize: number;
}) {
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ focused }) => [
        styles.step,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor:
            plus && focusedCard ? colors.coral : colors.panel2,
        },
        focused && styles.stepFocused,
      ]}
      accessibilityLabel={label}
    >
      <Animated.View style={animatedStyle}>
        <Text
          style={[
            styles.stepLabel,
            {
              fontSize,
              color: plus && focusedCard ? colors.navy : colors.offWhite,
            },
          ]}
        >
          {plus ? "+" : "−"}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function DurationStepper({
  label,
  valueMinutes,
  min,
  max,
  step = 5,
  tone = "watch",
  focusedCard,
  onChange,
}: Props) {
  const { s } = useLayout();
  const toneColor = tone === "watch" ? colors.amber : colors.green;
  const size = s(64);
  const radius = s(16);
  const fontSize = s(36);

  return (
    <View
      style={[
        styles.card,
        {
          borderRadius: s(28),
          padding: s(28),
          gap: s(12),
          borderWidth: focusedCard ? 4 : 1,
          borderColor: focusedCard ? colors.coral : colors.white10,
        },
      ]}
      accessibilityLabel={`${label} ${valueMinutes} minutes`}
    >
      <Text style={[styles.eyebrow, { color: toneColor, fontSize: s(18) }]}>
        {label.toUpperCase()}
      </Text>
      <View style={[styles.valueRow, { gap: s(12) }]}>
        <View style={[styles.valueBlock, { gap: s(10) }]}>
          <Text style={[styles.value, { fontSize: s(72), lineHeight: s(80) }]}>
            {valueMinutes}
          </Text>
          <Text style={[styles.unit, { fontSize: s(24) }]}>minutes</Text>
        </View>
        <View style={[styles.steps, { gap: s(10) }]}>
          <StepButton
            label={`Decrease ${label}`}
            onPress={() => onChange(Math.max(min, valueMinutes - step))}
            size={size}
            radius={radius}
            fontSize={fontSize}
          />
          <StepButton
            label={`Increase ${label}`}
            onPress={() => onChange(Math.min(max, valueMinutes + step))}
            focusedCard={focusedCard}
            plus
            size={size}
            radius={radius}
            fontSize={fontSize}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.panel,
    minWidth: 0,
    minHeight: 0,
    justifyContent: "flex-start",
  },
  eyebrow: { fontWeight: "700", letterSpacing: 1 },
  valueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    minHeight: 0,
  },
  valueBlock: {
    flexDirection: "row",
    alignItems: "baseline",
    flexShrink: 1,
  },
  value: { color: colors.offWhite, fontWeight: "700" },
  unit: { color: colors.muted, fontWeight: "500" },
  steps: { flexDirection: "row", flexShrink: 0 },
  step: {
    backgroundColor: colors.panel2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.white20,
  },
  stepFocused: { borderColor: colors.offWhite, borderWidth: 3 },
  stepLabel: { color: colors.offWhite, fontWeight: "600" },
});
