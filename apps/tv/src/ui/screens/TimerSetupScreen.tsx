import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { DurationStepper } from "../components/DurationStepper";
import { PinCells } from "../components/PinCells";
import { TvButton } from "../components/TvButton";
import { colors, safe } from "../../theme/tokens";

type Props = {
  pinPending: boolean;
  onSave: (watchMin: number, restMin: number, pin: string) => Promise<string | null>;
};

export function TimerSetupScreen({ pinPending, onSave }: Props) {
  const [watchMin, setWatchMin] = useState(15);
  const [restMin, setRestMin] = useState(30);
  const [pin, setPin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function persistPin(pinValue: string) {
    const err = await onSave(watchMin, restMin, pinValue);
    if (err) setError(err);
  }

  return (
    <View style={styles.shell} accessibilityLabel="Timer setup">
      <Text style={styles.title}>Timer setup</Text>
      <View style={styles.steppers}>
        <DurationStepper
          label="Watch"
          valueMinutes={watchMin}
          min={5}
          max={60}
          dense
          onChange={setWatchMin}
        />
        <DurationStepper
          label="Rest"
          valueMinutes={restMin}
          min={5}
          max={180}
          dense
          onChange={setRestMin}
        />
      </View>
      <Text style={styles.sub}>Parent PIN</Text>
      <View style={styles.pinRegion}>
        <PinCells
          disabled={pinPending}
          dense
          preferKeypadFocus
          onComplete={(value) => {
            setError(null);
            setPin(value);
            void persistPin(value);
          }}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TvButton
        label={pinPending ? "Saving…" : "Save and continue"}
        disabled={pinPending || !pin}
        onPress={() => {
          if (pin) void persistPin(pin);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.navy,
    paddingHorizontal: safe.horizontal,
    paddingVertical: safe.vertical,
    gap: 10,
  },
  title: {
    color: colors.offWhite,
    fontSize: 28,
    fontWeight: "700",
    flexShrink: 0,
  },
  steppers: {
    flexDirection: "row",
    gap: 32,
    flexShrink: 0,
    alignItems: "stretch",
  },
  sub: {
    color: colors.offWhite,
    fontSize: 18,
    flexShrink: 0,
  },
  pinRegion: {
    flex: 1,
    minHeight: 0,
    width: "100%",
  },
  error: {
    color: colors.amber,
    fontSize: 16,
    flexShrink: 0,
  },
});
