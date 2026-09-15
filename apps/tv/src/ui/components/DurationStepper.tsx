import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/tokens";

type Props = {
  label: string;
  valueMinutes: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
};

export function DurationStepper({
  label,
  valueMinutes,
  min,
  max,
  step = 5,
  onChange,
}: Props) {
  return (
    <View style={styles.row} accessibilityLabel={`${label} ${valueMinutes} minutes`}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => onChange(Math.max(min, valueMinutes - step))}
        style={({ focused }) => [styles.step, focused && styles.focused]}
        accessibilityLabel={`Decrease ${label}`}
      >
        <Text style={styles.stepLabel}>−</Text>
      </Pressable>
      <Text style={styles.value}>{valueMinutes} min</Text>
      <Pressable
        onPress={() => onChange(Math.min(max, valueMinutes + step))}
        style={({ focused }) => [styles.step, focused && styles.focused]}
        accessibilityLabel={`Increase ${label}`}
      >
        <Text style={styles.stepLabel}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
    marginVertical: 12,
  },
  label: {
    color: colors.offWhite,
    fontSize: 28,
    width: 220,
  },
  value: {
    color: colors.offWhite,
    fontSize: 32,
    fontWeight: "700",
    minWidth: 140,
    textAlign: "center",
  },
  step: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: colors.slate,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "transparent",
  },
  focused: { borderColor: colors.offWhite },
  stepLabel: { color: colors.offWhite, fontSize: 36, fontWeight: "600" },
});
