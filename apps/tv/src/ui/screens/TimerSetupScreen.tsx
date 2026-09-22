import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { DurationStepper } from "../components/DurationStepper";
import { TvButton } from "../components/TvButton";
import { ScreenHeader, ScreenShell } from "../components/ScreenChrome";
import { colors, useLayout } from "../../theme/tokens";

type Props = {
  onSave: (watchMin: number, restMin: number) => string | null;
};

export function TimerSetupScreen({ onSave }: Props) {
  const { s } = useLayout();
  const [watchMin, setWatchMin] = useState(15);
  const [restMin, setRestMin] = useState(30);
  const [error, setError] = useState<string | null>(null);

  return (
    <ScreenShell accessibilityLabel="Timer setup">
      <ScreenHeader
        section="Parent setup"
        title="Set a healthy rhythm"
        subtitle="Choose how long watching lasts and how long the break should be."
      />
      <View style={[styles.steppers, { gap: s(24), marginTop: s(28) }]}>
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
      <View style={[styles.footer, { paddingTop: s(16) }]}>
        {error ? (
          <Text style={[styles.error, { fontSize: s(18) }]}>{error}</Text>
        ) : (
          <View />
        )}
        <TvButton
          label="Save and choose videos"
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
  steppers: {
    flexDirection: "row",
    flex: 1,
    alignItems: "stretch",
    minHeight: 0,
    maxHeight: "55%",
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
