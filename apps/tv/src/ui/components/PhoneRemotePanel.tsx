import { StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { TvButton } from "./TvButton";
import { colors, useLayout } from "../../theme/tokens";
import type {
  CompanionStatus,
  PhoneRemote,
} from "../../companion/useCompanionServer";
import type { CompanionActivity } from "../../companion/handler";

type Props = {
  remote: PhoneRemote;
  onBack: () => void;
};

function activityLabel(a: CompanionActivity): string {
  switch (a.kind) {
    case "connected":
      return "Phone connected";
    case "added":
      return `Added “${a.title}”`;
    case "removed":
      return `Removed “${a.title}”`;
    case "timer":
      return `Timer set to ${a.watchMin} min watch, ${a.restMin} min break`;
  }
}

function minutesLeft(status: CompanionStatus): number {
  if (status.kind !== "running") return 0;
  return Math.max(1, Math.ceil((status.expiresAtMs - Date.now()) / 60_000));
}

/**
 * Parent settings → Add from phone. Shows the QR code for the phone remote
 * page; RootApp runs the server while this panel is open.
 */
export function PhoneRemotePanel({ remote, onBack }: Props) {
  const { s } = useLayout();
  const { status, activity, restart } = remote;
  const qrSize = s(300);
  const running = status.kind === "running";

  let headline = "Starting…";
  let detail = "Getting the phone link ready.";
  if (status.kind === "running") {
    headline = "Scan with your phone camera";
    detail = "Your phone must be on the same Wi‑Fi as this TV.";
  } else if (status.kind === "noNetwork") {
    headline = "Connect the TV to Wi‑Fi";
    detail = "The phone remote works over your home network. Connect this TV, then try again.";
  } else if (status.kind === "expired") {
    headline = "The phone link has expired";
    detail = "Make a new code to keep going.";
  } else if (status.kind === "error") {
    headline = "Couldn't start the phone link";
    detail = status.message;
  }

  return (
    <View style={[styles.root, { gap: s(28) }]}>
      <View
        style={[
          styles.qrFrame,
          {
            width: qrSize + s(32),
            height: qrSize + s(32),
            borderRadius: s(20),
          },
        ]}
        accessibilityLabel={running ? "QR code for the phone remote" : undefined}
      >
        {running ? (
          <QRCode
            value={status.url}
            size={qrSize}
            color={colors.navy}
            backgroundColor={colors.offWhite}
            ecl="M"
          />
        ) : (
          <Text style={[styles.qrPlaceholder, { fontSize: s(56) }]}>▢</Text>
        )}
      </View>

      <View style={[styles.info, { gap: s(10) }]}>
        <Text style={[styles.sectionLabel, { fontSize: s(16) }]}>
          ADD FROM PHONE
        </Text>
        <Text style={[styles.headline, { fontSize: s(30) }]}>{headline}</Text>
        <Text style={[styles.detail, { fontSize: s(19), lineHeight: s(26) }]}>
          {detail}
        </Text>
        {running ? (
          <>
            <Text style={[styles.detail, { fontSize: s(19), lineHeight: s(26) }]}>
              Pick shows, paste YouTube links and set the timer from your
              phone.
            </Text>
            <Text
              style={[styles.url, { fontSize: s(17), marginTop: s(4) }]}
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              {status.url.replace(/\?t=.*/, "")}
            </Text>
            <Text style={[styles.expiry, { fontSize: s(16) }]}>
              Link works for {minutesLeft(status)} more minute
              {minutesLeft(status) === 1 ? "" : "s"} while this screen is open.
            </Text>
          </>
        ) : null}

        {activity.length > 0 ? (
          <View style={[styles.activity, { gap: s(6), marginTop: s(8) }]}>
            {activity.map((a, i) => (
              <Text
                key={`${i}-${a.kind}`}
                style={[
                  styles.activityRow,
                  i === 0 && styles.activityLatest,
                  { fontSize: s(18) },
                ]}
                numberOfLines={1}
              >
                {i === 0 ? "● " : "   "}
                {activityLabel(a)}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={[styles.actions, { gap: s(14), marginTop: s(14) }]}>
          <TvButton
            label="Back"
            variant="secondary"
            onPress={onBack}
            {...({ hasTVPreferredFocus: true } as object)}
          />
          {status.kind === "running" ? null : (
            <TvButton
              label={status.kind === "expired" ? "New code" : "Try again"}
              onPress={restart}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row", alignItems: "center", minHeight: 0 },
  qrFrame: {
    backgroundColor: colors.offWhite,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  qrPlaceholder: { color: colors.muted },
  info: { flex: 1, minWidth: 0 },
  sectionLabel: { color: colors.muted, fontWeight: "700", letterSpacing: 1 },
  headline: { color: colors.offWhite, fontWeight: "700" },
  detail: { color: colors.muted },
  url: { color: colors.amber, fontWeight: "600" },
  expiry: { color: colors.muted, opacity: 0.8 },
  activity: {},
  activityRow: { color: colors.muted },
  activityLatest: { color: colors.green, fontWeight: "600" },
  actions: { flexDirection: "row" },
});
