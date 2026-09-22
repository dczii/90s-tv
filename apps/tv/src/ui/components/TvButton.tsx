import { Pressable, StyleSheet, Text, type PressableProps } from "react-native";
import Animated from "react-native-reanimated";
import { colors, useLayout } from "../../theme/tokens";
import { usePressScale } from "../motion/usePressScale";

/** Muted text control used on Ready / Rest for Parent settings. */
export function QuietLink({
  label,
  onPress,
  preferredFocus,
}: {
  label: string;
  onPress: () => void;
  preferredFocus?: boolean;
}) {
  const { s } = useLayout();
  return (
    <Pressable
      onPress={onPress}
      {...(preferredFocus ? ({ hasTVPreferredFocus: true } as object) : {})}
      style={({ focused }) => [
        styles.link,
        {
          paddingVertical: s(10),
          paddingHorizontal: s(12),
          borderRadius: s(12),
        },
        focused && styles.linkFocused,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.linkLabel, { fontSize: s(20) }]}>{label}</Text>
    </Pressable>
  );
}

type Props = PressableProps & {
  label: string;
  variant?: "primary" | "secondary" | "destructive";
  stretch?: boolean;
};

export function TvButton({
  label,
  variant = "primary",
  disabled,
  stretch,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  const { s } = useLayout();
  const { animatedStyle, onPressIn: scaleIn, onPressOut: scaleOut } =
    usePressScale();
  const labelColor =
    variant === "destructive"
      ? colors.dangerText
      : variant === "primary"
        ? colors.navy
        : colors.offWhite;

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        scaleIn();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scaleOut();
        onPressOut?.(e);
      }}
      style={({ focused, pressed }) => [
        styles.base,
        {
          minHeight: s(76),
          minWidth: s(280),
          paddingVertical: s(18),
          paddingHorizontal: s(28),
          borderRadius: s(18),
        },
        stretch && styles.stretch,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "destructive" && styles.destructive,
        (focused || pressed) && styles.focused,
        disabled && styles.disabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {({ focused }) => (
        <Animated.View style={[styles.row, { gap: s(16) }, animatedStyle]}>
          <Text
            style={[
              styles.label,
              { color: labelColor, fontSize: s(26), flexShrink: 1 },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
          {focused && !disabled ? (
            <Text
              style={[styles.pressOk, { color: labelColor, fontSize: s(18) }]}
            >
              Press OK
            </Text>
          ) : null}
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: "flex-start",
    borderWidth: 4,
    borderColor: "transparent",
    justifyContent: "center",
  },
  stretch: { alignSelf: "stretch", minWidth: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  primary: { backgroundColor: colors.coral },
  secondary: {
    backgroundColor: colors.panel2,
    borderColor: colors.white20,
    borderWidth: 1,
  },
  destructive: {
    backgroundColor: colors.danger,
    borderColor: colors.coral,
    borderWidth: 1,
  },
  focused: {
    borderColor: colors.coral,
    borderWidth: 4,
  },
  disabled: { opacity: 0.45 },
  label: {
    fontWeight: "700",
  },
  pressOk: {
    fontWeight: "600",
    flexShrink: 0,
  },
  link: {
    alignSelf: "flex-start",
    borderWidth: 2,
    borderColor: "transparent",
  },
  linkFocused: {
    borderColor: colors.coral,
  },
  linkLabel: {
    color: colors.muted,
    fontWeight: "600",
  },
});
