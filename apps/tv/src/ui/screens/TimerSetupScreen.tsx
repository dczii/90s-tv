import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
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
  const { s } = useLayout();
  const [watchMin, setWatchMin] = useState(15);
  const [restMin, setRestMin] = useState(30);
  const [error, setError] = useState<string | null>(null);

  return (
    <ScreenShell accessibilityLabel="Timer setup">
      <ScreenHeader
        section="Parent setup"
        title="Set a healthy rhythm"
        subtitle="Choose watch and break time. Scan the code to add shows from your phone."
      />
      <View style={[styles.body, { gap: s(24), marginTop: s(20) }]}>
        <View style={[styles.steppers, { gap: s(24) }]}>
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
            { borderRadius: s(24), padding: s(20), gap: s(12) },
          ]}
        >
          {phoneUrl ? (
            <View
              style={[styles.qrCard, { borderRadius: s(8) }]}
              accessibilityLabel="QR code to add YouTube links on your phone"
            >
              <QRCode
                value={phoneUrl}
                size={s(460)}
                color={colors.navy}
                backgroundColor={colors.offWhite}
                quietZone={4}
              />
            </View>
          ) : null}
          <Text style={[styles.hint, { fontSize: s(18), lineHeight: s(26) }]}>
            {phoneLinkOffline
              ? "Connect the TV to Wi‑Fi"
              : "Same Wi‑Fi. Scan to add or remove YouTube links."}
          </Text>
        </View>
      </View>
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
  body: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 0,
  },
  steppers: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
    maxHeight: "70%",
  },
  qrPanel: {
    flex: 1,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.white10,
    alignItems: "center",
    justifyContent: "center",
  },
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
