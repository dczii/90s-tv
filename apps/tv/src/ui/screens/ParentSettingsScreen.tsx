import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ENFORCEMENT_NOTE, type TimerSnapshot } from "@littleplay/core";
import { DurationStepper } from "../components/DurationStepper";
import { TvButton } from "../components/TvButton";
import { ScreenHeader, ScreenShell } from "../components/ScreenChrome";
import { colors, useLayout } from "../../theme/tokens";

type Props = {
  snapshot: TimerSnapshot;
  allowlistCount: number;
  onChangePolicy: (watchMin: number, restMin: number) => string | null;
  onResetCycle: () => string | null;
  onManageContent: () => void;
  onClose: () => void;
};

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ParentSettingsScreen({
  snapshot,
  allowlistCount,
  onChangePolicy,
  onResetCycle,
  onManageContent,
  onClose,
}: Props) {
  const { s } = useLayout();
  const [watchMin, setWatchMin] = useState(
    Math.round(snapshot.policy.watchDurationMs / 60_000),
  );
  const [restMin, setRestMin] = useState(
    Math.round(snapshot.policy.restDurationMs / 60_000),
  );
  const [editingPolicy, setEditingPolicy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remainingLabel =
    snapshot.phase === "Playing" || snapshot.phase === "Resting"
      ? formatRemaining(snapshot.remainingMs)
      : "—";
  const remainingHint =
    snapshot.phase === "Playing"
      ? "watch time remaining"
      : snapshot.phase === "Resting"
        ? "break time remaining"
        : snapshot.phase === "AwaitingConfirmation"
          ? "ready to continue"
          : "setup";

  return (
    <ScreenShell accessibilityLabel="Parent settings">
      <ScreenHeader section="Settings" title="Parent settings" />
      <View style={[styles.columns, { gap: s(24), marginTop: s(12) }]}>
        <View
          style={[
            styles.mainPanel,
            {
              borderRadius: s(24),
              padding: s(28),
              gap: s(10),
              flex: 1.5,
            },
          ]}
        >
          {editingPolicy ? (
            <View style={[styles.editBlock, { gap: s(14) }]}>
              <Text style={[styles.sectionLabel, { fontSize: s(16) }]}>
                WATCH & BREAK
              </Text>
              <View style={[styles.steppers, { gap: s(16) }]}>
                <DurationStepper
                  label="Watch time"
                  tone="watch"
                  valueMinutes={watchMin}
                  min={1}
                  max={60}
                  step={1}
                  focusedCard
                  onChange={(v) => {
                    setWatchMin(v);
                    setError(onChangePolicy(v, restMin));
                  }}
                />
                <DurationStepper
                  label="Break time"
                  tone="break"
                  valueMinutes={restMin}
                  min={1}
                  max={180}
                  step={1}
                  onChange={(v) => {
                    setRestMin(v);
                    setError(onChangePolicy(watchMin, v));
                  }}
                />
              </View>
              <TvButton
                label="Done editing"
                variant="secondary"
                onPress={() => setEditingPolicy(false)}
              />
            </View>
          ) : (
            <>
              <Text style={[styles.sectionLabel, { fontSize: s(16) }]}>
                WATCH & BREAK
              </Text>
              <SettingsRow
                label="Watch window"
                value={`${watchMin} minute${watchMin === 1 ? "" : "s"}`}
                icon="⏱"
                iconColor={colors.amber}
                s={s}
              />
              <Divider />
              <SettingsRow
                label="Break window"
                value={`${restMin} minute${restMin === 1 ? "" : "s"}`}
                icon="🧘"
                iconColor={colors.green}
                s={s}
              />
              <Divider />
              <Text
                style={[styles.sectionLabel, { fontSize: s(16), marginTop: s(8) }]}
              >
                CONTENT
              </Text>
              <Pressable
                onPress={onManageContent}
                style={({ focused }) => [
                  styles.manageHit,
                  {
                    borderRadius: s(16),
                    marginHorizontal: s(-8),
                    paddingHorizontal: s(8),
                  },
                  focused && styles.manageFocused,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Manage allowed content"
              >
                <SettingsRow
                  label="Manage allowed content"
                  value={`${allowlistCount} source${allowlistCount === 1 ? "" : "s"}`}
                  icon="▤"
                  mutedValue
                  iconColor={colors.offWhite}
                  s={s}
                />
              </Pressable>
              <Divider />
              <SettingsRow
                label="Content source"
                value="App catalog"
                icon="▶"
                iconColor={colors.offWhite}
                s={s}
              />
            </>
          )}
        </View>
        <View style={[styles.sideCol, { gap: s(16), flex: 0.85 }]}>
          <View
            style={[
              styles.cycleCard,
              {
                borderRadius: s(24),
                padding: s(28),
                gap: s(8),
                borderWidth: 4,
                borderColor: colors.coral,
              },
            ]}
          >
            <Text style={[styles.sectionLabel, { fontSize: s(16) }]}>
              CURRENT CYCLE
            </Text>
            <Text style={[styles.cycleTime, { fontSize: s(52) }]}>
              {remainingLabel}
            </Text>
            <Text style={[styles.cycleHint, { fontSize: s(18) }]}>
              {remainingHint}
            </Text>
          </View>
          <TvButton
            label="Edit timer policy"
            stretch
            onPress={() => setEditingPolicy(true)}
            {...({ hasTVPreferredFocus: true } as object)}
          />
          <TvButton
            label="Reset current cycle"
            variant="destructive"
            stretch
            onPress={() => setError(onResetCycle())}
          />
          <TvButton label="Done" variant="secondary" stretch onPress={onClose} />
          {error ? (
            <Text style={[styles.error, { fontSize: s(16) }]}>{error}</Text>
          ) : null}
          <Text style={[styles.note, { fontSize: s(13), lineHeight: s(18) }]}>
            {ENFORCEMENT_NOTE}
          </Text>
        </View>
      </View>
    </ScreenShell>
  );
}

function SettingsRow({
  label,
  value,
  icon,
  iconColor,
  s,
  mutedValue,
}: {
  label: string;
  value: string;
  icon: string;
  iconColor: string;
  s: (n: number) => number;
  mutedValue?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text
        style={[
          styles.rowIcon,
          { width: s(28), fontSize: s(24), color: iconColor },
        ]}
      >
        {icon}
      </Text>
      <Text
        style={[styles.rowLabel, { fontSize: s(22), marginLeft: s(12) }]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.rowValue,
          mutedValue && styles.rowValueMuted,
          { fontSize: s(20) },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  columns: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
  },
  mainPanel: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.white10,
    minWidth: 0,
  },
  editBlock: { minHeight: 0 },
  steppers: { flexDirection: "row", minHeight: 0, maxHeight: "58%" },
  sideCol: { minWidth: 0 },
  cycleCard: {
    backgroundColor: colors.panel,
  },
  sectionLabel: {
    color: colors.muted,
    fontWeight: "700",
    letterSpacing: 1,
  },
  cycleTime: { color: colors.offWhite, fontWeight: "700" },
  cycleHint: { color: colors.muted },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  manageHit: {
    borderWidth: 4,
    borderColor: "transparent",
  },
  manageFocused: {
    borderColor: colors.coral,
  },
  rowIcon: { textAlign: "center" },
  rowLabel: { color: colors.offWhite, fontWeight: "600", flex: 1 },
  rowValue: { color: colors.offWhite, fontWeight: "700" },
  rowValueMuted: { color: colors.muted, fontWeight: "600" },
  divider: {
    height: 1,
    backgroundColor: colors.white10,
    alignSelf: "stretch",
  },
  error: { color: colors.amber },
  note: { color: colors.muted, opacity: 0.8 },
});
