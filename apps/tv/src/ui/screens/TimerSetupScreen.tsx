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
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"create" | "confirm">("create");

  async function save() {
    if (!pin || pin !== confirm) {
      setError("PINs do not match");
      return;
    }
    const err = await onSave(watchMin, restMin, pin);
    if (err) setError(err);
  }

  return (
    <View style={styles.shell} accessibilityLabel="Timer setup">
      <Text style={styles.title}>Timer setup</Text>
      <DurationStepper
        label="Watch"
        valueMinutes={watchMin}
        min={5}
        max={60}
        onChange={setWatchMin}
      />
      <DurationStepper
        label="Rest"
        valueMinutes={restMin}
        min={5}
        max={180}
        onChange={setRestMin}
      />
      <Text style={styles.sub}>
        {mode === "create" ? "Create parent PIN" : "Confirm parent PIN"}
      </Text>
      <PinCells
        disabled={pinPending}
        onComplete={(value) => {
          setError(null);
          if (mode === "create") {
            setPin(value);
            setMode("confirm");
          } else {
            setConfirm(value);
          }
        }}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TvButton
        label={pinPending ? "Saving…" : "Save and continue"}
        disabled={pinPending || !pin || !confirm}
        onPress={() => {
          void save();
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
    justifyContent: "center",
    gap: 16,
  },
  title: { color: colors.offWhite, fontSize: 42, fontWeight: "700" },
  sub: { color: colors.offWhite, fontSize: 26, marginTop: 12 },
  error: { color: colors.amber, fontSize: 24 },
});
