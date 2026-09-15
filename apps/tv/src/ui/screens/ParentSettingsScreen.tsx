import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ENFORCEMENT_NOTE, type TimerSnapshot } from "@nostalgiabox/core";
import { DurationStepper } from "../components/DurationStepper";
import { PinCells } from "../components/PinCells";
import { TvButton } from "../components/TvButton";
import { colors, safe } from "../../theme/tokens";

type Props = {
  snapshot: TimerSnapshot;
  unlocked: boolean;
  pinPending: boolean;
  signedIn: boolean;
  allowlistCount: number;
  onVerify: (pin: string) => Promise<string | null>;
  onChangePolicy: (watchMin: number, restMin: number) => string | null;
  onResetCycle: () => string | null;
  onConnect: () => void;
  onManageContent: () => void;
  onClose: () => void;
};

export function ParentSettingsScreen({
  snapshot,
  unlocked,
  pinPending,
  signedIn,
  allowlistCount,
  onVerify,
  onChangePolicy,
  onResetCycle,
  onConnect,
  onManageContent,
  onClose,
}: Props) {
  const [watchMin, setWatchMin] = useState(
    Math.round(snapshot.policy.watchDurationMs / 60_000),
  );
  const [restMin, setRestMin] = useState(
    Math.round(snapshot.policy.restDurationMs / 60_000),
  );
  const [error, setError] = useState<string | null>(null);

  if (!unlocked) {
    return (
      <View style={styles.shell} accessibilityLabel="Parent PIN gate">
        <Text style={styles.title}>Enter parent PIN</Text>
        <PinCells
          disabled={pinPending}
          onComplete={(pin) => {
            void onVerify(pin).then((err) => setError(err));
          }}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TvButton label="Back" variant="secondary" onPress={onClose} />
      </View>
    );
  }

  return (
    <View style={styles.shell} accessibilityLabel="Parent settings">
      <Text style={styles.title}>Parent settings</Text>
      <Text style={styles.body}>
        Watch {watchMin} min · Rest {restMin} min · Phase {snapshot.phase}
      </Text>
      <Text style={styles.body}>
        {signedIn ? "YouTube connected" : "YouTube not connected"} ·{" "}
        {allowlistCount} allowed
      </Text>
      <DurationStepper
        label="Watch"
        valueMinutes={watchMin}
        min={5}
        max={60}
        onChange={(v) => {
          setWatchMin(v);
          setError(onChangePolicy(v, restMin));
        }}
      />
      <DurationStepper
        label="Rest"
        valueMinutes={restMin}
        min={5}
        max={180}
        onChange={(v) => {
          setRestMin(v);
          setError(onChangePolicy(watchMin, v));
        }}
      />
      <TvButton
        label={signedIn ? "YouTube account" : "Connect YouTube"}
        variant="secondary"
        onPress={onConnect}
      />
      <TvButton
        label="Manage allowed content"
        variant="secondary"
        onPress={onManageContent}
      />
      <TvButton
        label="Reset current cycle"
        variant="destructive"
        onPress={() => setError(onResetCycle())}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.note}>{ENFORCEMENT_NOTE}</Text>
      <TvButton label="Done" onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.navy,
    paddingHorizontal: safe.horizontal,
    paddingVertical: safe.vertical,
    justifyContent: "center",
    gap: 16,
  },
  title: { color: colors.offWhite, fontSize: 42, fontWeight: "700" },
  body: { color: colors.offWhite, fontSize: 26 },
  note: {
    color: colors.slateMuted,
    fontSize: 18,
    maxWidth: 1100,
    lineHeight: 26,
  },
  error: { color: colors.amber, fontSize: 22 },
});
