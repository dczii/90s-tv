import { Pressable, StyleSheet, Text, type PressableProps } from "react-native";
import { colors } from "../../theme/tokens";

type Props = PressableProps & {
  label: string;
  variant?: "primary" | "secondary" | "destructive";
};

export function TvButton({
  label,
  variant = "primary",
  disabled,
  ...rest
}: Props) {
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      style={({ focused, pressed }) => [
        styles.base,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "destructive" && styles.destructive,
        (focused || pressed) && styles.focused,
        disabled && styles.disabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: 280,
    paddingVertical: 18,
    paddingHorizontal: 28,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: "transparent",
  },
  primary: { backgroundColor: colors.coral },
  secondary: { backgroundColor: colors.slate },
  destructive: { backgroundColor: colors.danger },
  focused: {
    borderColor: colors.offWhite,
    transform: [{ scale: 1.02 }],
  },
  disabled: { opacity: 0.45 },
  label: {
    color: colors.offWhite,
    fontSize: 28,
    fontWeight: "600",
    textAlign: "center",
  },
});
