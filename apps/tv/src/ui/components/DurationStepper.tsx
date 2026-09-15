import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/tokens";

type Props = {
  label: string;
  valueMinutes: number;
  min: number;
  max: number;
  step?: number;
  dense?: boolean;
  onChange: (next: number) => void;
};

export function DurationStepper({
  label,
  valueMinutes,
  min,
  max,
  step = 5,
  dense,
  onChange,
}: Props) {
  return (
    <View
      style={[styles.row, dense && styles.rowDense]}
      accessibilityLabel={`${label} ${valueMinutes} minutes`}
    >
      <Text style={[styles.label, dense && styles.labelDense]}>{label}</Text>
      <Pressable
        onPress={() => onChange(Math.max(min, valueMinutes - step))}
        style={({ focused }) => [
          styles.step,
          dense && styles.stepDense,
          focused && styles.focused,
        ]}
        accessibilityLabel={`Decrease ${label}`}
      >
        <Text style={[styles.stepLabel, dense && styles.stepLabelDense]}>−</Text>
      </Pressable>
      <Text style={[styles.value, dense && styles.valueDense]}>
        {valueMinutes} min
      </Text>
      <Pressable
        onPress={() => onChange(Math.min(max, valueMinutes + step))}
        style={({ focused }) => [
          styles.step,
          dense && styles.stepDense,
          focused && styles.focused,
        ]}
        accessibilityLabel={`Increase ${label}`}
      >
        <Text style={[styles.stepLabel, dense && styles.stepLabelDense]}>+</Text>
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
  rowDense: {
    flex: 1,
    gap: 10,
    marginVertical: 0,
    minWidth: 0,
  },
  label: {
    color: colors.offWhite,
    fontSize: 28,
    flex: 1,
  },
  labelDense: {
    fontSize: 18,
    flex: 0.85,
  },
  value: {
    color: colors.offWhite,
    fontSize: 32,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
  },
  valueDense: {
    fontSize: 20,
    flex: 1.1,
  },
  step: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: colors.slate,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "transparent",
  },
  stepDense: {
    borderRadius: 8,
    borderWidth: 2,
  },
  focused: { borderColor: colors.offWhite },
  stepLabel: { color: colors.offWhite, fontSize: 36, fontWeight: "600" },
  stepLabelDense: { fontSize: 24 },
});
