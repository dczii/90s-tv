import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { DurationStepper } from "../components/DurationStepper";
import { TvButton } from "../components/TvButton";
import { ScreenHeader, ScreenShell } from "../components/ScreenChrome";
import { colors, useLayout } from "../../theme/tokens";

type Props = {
  onSave: (watchMin: number, restMin: number) => string | null;
  phoneUrl: string | null;
  phoneLinkOffline: boolean;
};

export function TimerSetupScreen({
  onSave,
  phoneUrl,
  phoneLinkOffline,
}: Props) {
  const { s, compact } = useLayout();
  const [watchMin, setWatchMin] = useState(15);
  const [restMin, setRestMin] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const wifiHint = phoneLinkOffline
    ? "Connect to Wi‑Fi"
    : "Same Wi‑Fi. Scan from another device to add or remove YouTube links.";
  const region = (
    <>
      <View
        style={[
          styles.steppers,
          compact && styles.steppersCompact,
          { gap: s(24) },
        ]}
      >
        <DurationStepper
          label="Watch time"
          tone="watch"
          valueMinutes={watchMin}
          min={1}
          max={60}
          step={1}
          focusedCard
          onChange={setWatchMin}
        />
        <DurationStepper
          label="Break time"
          tone="break"
          valueMinutes={restMin}
          min={1}
          max={180}
          step={1}
          onChange={setRestMin}
        />
      </View>
      <View
        style={[
          styles.qrPanel,
          compact && styles.qrPanelCompact,
          { borderRadius: s(24), padding: s(20), gap: s(12) },
        ]}
      >
        {phoneUrl ? (
          <View
            style={[styles.qrCard, { borderRadius: s(8) }]}
            accessibilityLabel="QR code to add YouTube links from another device"
          >
            <QRCode
              value={phoneUrl}
              size={compact ? 148 : s(460)}
              color={colors.navy}
              backgroundColor={colors.offWhite}
              quietZone={4}
            />
          </View>
        ) : null}
        <Text style={[styles.hint, { fontSize: s(18), lineHeight: s(26) }]}>
          {wifiHint}
        </Text>
      </View>
    </>
  );

  return (
    <ScreenShell accessibilityLabel="Timer setup">
      <ScreenHeader
        section="Parent setup"
        title="Set a healthy rhythm"
        subtitle={
          compact
            ? "Choose watch and break time. Add shows in the app, or scan the code from another device on this Wi‑Fi."
            : "Choose watch and break time. Scan the code to add shows from your phone."
        }
      />
      {compact ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.body,
            styles.bodyCompact,
            { gap: s(24), marginTop: s(20), flexGrow: 1 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {region}
        </ScrollView>
      ) : (
        <View style={[styles.body, { gap: s(24), marginTop: s(20), flex: 1 }]}>
          {region}
        </View>
      )}
      <View style={[styles.footer, { paddingTop: s(16) }]}>
        {error ? (
          <Text style={[styles.error, { fontSize: s(18) }]}>{error}</Text>
        ) : (
          <View />
        )}
        <TvButton
          label="Save timers"
          onPress={() => {
            const err = onSave(watchMin, restMin);
            if (err) setError(err);
          }}
          {...({ hasTVPreferredFocus: true } as object)}
        />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, minHeight: 0 },
  body: {
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 0,
  },
  bodyCompact: { flexDirection: "column" },
  steppers: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
    maxHeight: "70%",
  },
  steppersCompact: {
    flexDirection: "column",
    maxHeight: undefined,
  },
  qrPanel: {
    flex: 1,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.white10,
    alignItems: "center",
    justifyContent: "center",
  },
  qrPanelCompact: { flex: 0 },
  qrCard: {
    backgroundColor: colors.offWhite,
    overflow: "hidden",
  },
  hint: {
    color: colors.offWhite,
    fontWeight: "600",
    textAlign: "center",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexShrink: 0,
    marginTop: "auto",
  },
  error: { color: colors.amber },
});
