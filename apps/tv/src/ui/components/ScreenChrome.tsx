import { type ReactNode } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { PRODUCT_NAME } from "@littleplay/core";
import { colors, useLayout } from "../../theme/tokens";

type Atmosphere = "welcome" | "ready";

type ShellProps = {
  children: ReactNode;
  accessibilityLabel?: string;
  atmosphere?: Atmosphere;
};

function ScreenAtmosphere({ variant }: { variant: Atmosphere }) {
  const { width, height } = useWindowDimensions();
  if (variant === "welcome") {
    return (
      <Svg
        width={width}
        height={height}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        <Defs>
          <RadialGradient id="welcomeGlow" cx="78%" cy="42%" rx="70%" ry="70%">
            <Stop offset="0" stopColor="#263A55" />
            <Stop offset="1" stopColor={colors.navy} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#welcomeGlow)" />
      </Svg>
    );
  }
  return (
    <Svg
      width={width}
      height={height}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id="readyGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0" stopColor="#30445F" />
          <Stop offset="0.52" stopColor="#111B2A" />
          <Stop offset="1" stopColor={colors.navy} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#readyGlow)" />
    </Svg>
  );
}

function TimerMark({ size }: { size: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityLabel="LittlePlay"
    >
      <Path
        d="M13.41 3.11 A 9 9 0 0 1 13.41 20.89"
        stroke={colors.amber}
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M10.59 20.89 A 9 9 0 0 1 10.59 3.11"
        stroke={colors.green}
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M10 8.4v7.2L16.2 12z"
        fill={colors.coral}
        stroke={colors.coral}
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Full-screen navy shell with 5% safe padding derived from window size. */
export function ScreenShell({
  children,
  accessibilityLabel,
  atmosphere,
}: ShellProps) {
  const { safeX, safeY } = useLayout();
  return (
    <View style={styles.shell} accessibilityLabel={accessibilityLabel}>
      {atmosphere ? <ScreenAtmosphere variant={atmosphere} /> : null}
      <View
        style={[
          styles.safe,
          { paddingHorizontal: safeX, paddingVertical: safeY },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

type BrandProps = {
  section?: string;
};

export function BrandRow({ section }: BrandProps) {
  const { s } = useLayout();
  return (
    <View style={[styles.brandRow, { gap: s(12) }]}>
      <TimerMark size={s(44)} />
      <Text style={[styles.brand, { fontSize: s(24) }]}>{PRODUCT_NAME}</Text>
      {section ? (
        <Text style={[styles.section, { fontSize: s(18) }]}>
          {section.toUpperCase()}
        </Text>
      ) : null}
    </View>
  );
}

type HeaderProps = {
  title: string;
  subtitle?: string;
  section?: string;
};

export function ScreenHeader({ title, subtitle, section }: HeaderProps) {
  const { s } = useLayout();
  return (
    <View style={[styles.header, { gap: s(10) }]}>
      <BrandRow section={section} />
      <Text style={[styles.title, { fontSize: s(48), lineHeight: s(56) }]}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { fontSize: s(24), lineHeight: s(32) }]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.navy,
    minHeight: 0,
    minWidth: 0,
  },
  safe: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  brand: { color: colors.offWhite, fontWeight: "800", flexShrink: 0 },
  section: {
    color: colors.muted,
    fontWeight: "700",
    marginLeft: "auto",
    letterSpacing: 1,
  },
  header: { flexShrink: 0 },
  title: { color: colors.offWhite, fontWeight: "700" },
  subtitle: { color: colors.muted, fontWeight: "400", maxWidth: "70%" },
});
