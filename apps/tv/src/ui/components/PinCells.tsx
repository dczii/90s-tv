import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/tokens";

type Props = {
  length?: number;
  disabled?: boolean;
  onComplete: (pin: string) => void;
};

export function PinCells({ length = 4, disabled, onComplete }: Props) {
  const [digits, setDigits] = useState<string[]>([]);
  const display = useMemo(() => {
    const cells = Array.from({ length }, (_, i) => digits[i] ?? "");
    return cells;
  }, [digits, length]);

  function append(d: string) {
    if (disabled) return;
    const next = [...digits, d].slice(0, length);
    setDigits(next);
    if (next.length === length) {
      onComplete(next.join(""));
      setDigits([]);
    }
  }

  function backspace() {
    if (disabled) return;
    setDigits((prev) => prev.slice(0, -1));
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.cells}>
        {display.map((d, i) => (
          <View key={i} style={styles.cell}>
            <Text style={styles.cellText}>{d ? "•" : ""}</Text>
          </View>
        ))}
      </View>
      <View style={styles.pad}>
        {"123456789".split("").map((d) => (
          <Pressable
            key={d}
            disabled={disabled}
            onPress={() => append(d)}
            style={({ focused }) => [styles.key, focused && styles.focused]}
            accessibilityLabel={`Digit ${d}`}
          >
            <Text style={styles.keyText}>{d}</Text>
          </Pressable>
        ))}
        <Pressable
          disabled={disabled}
          onPress={backspace}
          style={({ focused }) => [styles.key, focused && styles.focused]}
          accessibilityLabel="Backspace"
        >
          <Text style={styles.keyText}>⌫</Text>
        </Pressable>
        <Pressable
          disabled={disabled}
          onPress={() => append("0")}
          style={({ focused }) => [styles.key, focused && styles.focused]}
          accessibilityLabel="Digit 0"
        >
          <Text style={styles.keyText}>0</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 24 },
  cells: { flexDirection: "row", gap: 16 },
  cell: {
    width: 64,
    height: 80,
    borderRadius: 10,
    backgroundColor: colors.slate,
    alignItems: "center",
    justifyContent: "center",
  },
  cellText: { color: colors.offWhite, fontSize: 36 },
  pad: {
    width: 360,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
  },
  key: {
    width: 96,
    height: 64,
    borderRadius: 10,
    backgroundColor: colors.slate,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "transparent",
  },
  focused: { borderColor: colors.offWhite },
  keyText: { color: colors.offWhite, fontSize: 28, fontWeight: "600" },
});
