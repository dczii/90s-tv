import { StyleSheet, Text, View } from "react-native";
import type { TimerSnapshot } from "@nostalgiabox/core";
import { TvButton } from "../components/TvButton";
import { colors, safe } from "../../theme/tokens";

type Props = {
  snapshot: TimerSnapshot;
  onContinue: () => void;
  onOpenSettings: () => void;
};

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ReadyScreen({
  snapshot,
  onContinue,
  onOpenSettings,
  allowlistEmpty = false,
}: Props & { allowlistEmpty?: boolean }) {
  const watchMin = Math.round(snapshot.policy.watchDurationMs / 60_000);
  return (
    <View style={styles.shell} accessibilityLabel="Continue watching">
      <Text style={styles.title}>{watchMin} minutes available</Text>
      <Text style={styles.body}>
        Watching starts only when you press Continue watching.
        {allowlistEmpty
          ? " Add allowed videos in Parent settings before continuing."
          : ""}
      </Text>
      <TvButton
        label="Continue watching"
        disabled={allowlistEmpty}
        onPress={onContinue}
      />
      <TvButton
        label="Parent settings"
        variant="secondary"
        onPress={onOpenSettings}
      />
    </View>
  );
}

export function RestScreen({
  snapshot,
  onOpenSettings,
}: {
  snapshot: TimerSnapshot;
  onOpenSettings: () => void;
}) {
  return (
    <View style={styles.shell} accessibilityLabel="Rest timer">
      <Text style={styles.title}>Time for a break</Text>
      <Text style={styles.countdown}>{formatRemaining(snapshot.remainingMs)}</Text>
      <Text style={styles.body}>
        When this timer reaches zero, Continue watching will be required before
        another watch window can start. The player is not present.
      </Text>
      <TvButton
        label="Parent settings"
        variant="secondary"
        onPress={onOpenSettings}
      />
    </View>
  );
}

export function PlayingShell({
  snapshot,
  onOpenSettings,
}: {
  snapshot: TimerSnapshot;
  onOpenSettings: () => void;
}) {
  return (
    <View style={styles.shell} accessibilityLabel="Playing">
      <Text style={styles.pill}>{formatRemaining(snapshot.remainingMs)} left</Text>
      <Text style={styles.body}>
        Player host arrives in Step 4. The watch window is already open and
        counting down.
      </Text>
      <TvButton
        label="Parent settings"
        variant="secondary"
        onPress={onOpenSettings}
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
    gap: 24,
  },
  title: { color: colors.offWhite, fontSize: 48, fontWeight: "700" },
  countdown: {
    color: colors.amber,
    fontSize: 72,
    fontWeight: "700",
  },
  body: { color: colors.offWhite, fontSize: 26, maxWidth: 1100, lineHeight: 36 },
  pill: {
    alignSelf: "flex-start",
    color: colors.offWhite,
    backgroundColor: colors.slate,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    fontSize: 28,
    fontWeight: "600",
  },
});
