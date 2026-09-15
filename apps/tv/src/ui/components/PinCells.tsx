import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/tokens";

type Props = {
  length?: number;
  disabled?: boolean;
  dense?: boolean;
  /** Move TV focus to digit 1 when the pad mounts. */
  preferKeypadFocus?: boolean;
  onComplete: (pin: string) => void;
};

export function PinCells({
  length = 4,
  disabled,
  dense,
  preferKeypadFocus,
  onComplete,
}: Props) {
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

  const cellStyle = dense ? styles.cellDense : styles.cell;
  const keyStyle = dense ? styles.keyDense : styles.key;
  const cellTextStyle = dense ? styles.cellTextDense : styles.cellText;
  const keyTextStyle = dense ? styles.keyTextDense : styles.keyText;

  return (
    <View style={[styles.wrap, dense && styles.wrapDense]}>
      <View style={styles.cells}>
        {display.map((d, i) => (
          <View key={i} style={cellStyle}>
            <Text style={cellTextStyle}>{d ? "•" : ""}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.pad, dense && styles.padDense]}>
        {"123456789".split("").map((d) => (
          <Pressable
            key={d}
            disabled={disabled}
            onPress={() => append(d)}
            {...(preferKeypadFocus && d === "1"
              ? ({ hasTVPreferredFocus: true } as object)
              : {})}
            style={({ focused }) => [keyStyle, focused && styles.focused]}
            accessibilityLabel={`Digit ${d}`}
          >
            <Text style={keyTextStyle}>{d}</Text>
          </Pressable>
        ))}
        <Pressable
          disabled={disabled}
          onPress={backspace}
          style={({ focused }) => [keyStyle, focused && styles.focused]}
          accessibilityLabel="Backspace"
        >
          <Text style={keyTextStyle}>⌫</Text>
        </Pressable>
        <Pressable
          disabled={disabled}
          onPress={() => append("0")}
          style={({ focused }) => [keyStyle, focused && styles.focused]}
          accessibilityLabel="Digit 0"
        >
          <Text style={keyTextStyle}>0</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    gap: 24,
  },
  wrapDense: {
    flex: 1,
    gap: 8,
    justifyContent: "space-evenly",
  },
  cells: {
    flexDirection: "row",
    gap: 16,
    alignSelf: "stretch",
    flexShrink: 0,
  },
  cell: {
    flex: 1,
    aspectRatio: 0.85,
    borderRadius: 10,
    backgroundColor: colors.slate,
    alignItems: "center",
    justifyContent: "center",
  },
  cellDense: {
    flex: 1,
    aspectRatio: 1.2,
    borderRadius: 8,
    backgroundColor: colors.slate,
    alignItems: "center",
    justifyContent: "center",
  },
  cellText: { color: colors.offWhite, fontSize: 36 },
  cellTextDense: { color: colors.offWhite, fontSize: 22 },
  pad: {
    alignSelf: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
  },
  padDense: {
    flex: 1,
    gap: 8,
    alignContent: "center",
  },
  key: {
    flexBasis: "30%",
    flexGrow: 1,
    aspectRatio: 1.45,
    borderRadius: 10,
    backgroundColor: colors.slate,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "transparent",
  },
  keyDense: {
    flexBasis: "30%",
    flexGrow: 1,
    aspectRatio: 1.55,
    borderRadius: 8,
    backgroundColor: colors.slate,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  focused: { borderColor: colors.offWhite },
  keyText: { color: colors.offWhite, fontSize: 28, fontWeight: "600" },
  keyTextDense: { color: colors.offWhite, fontSize: 20, fontWeight: "600" },
});
