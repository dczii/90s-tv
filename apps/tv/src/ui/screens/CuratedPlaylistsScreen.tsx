import { StyleSheet, Text, View } from "react-native";
import { TvButton } from "../components/TvButton";
import { ScreenHeader, ScreenShell } from "../components/ScreenChrome";
import { colors, useLayout } from "../../theme/tokens";
import { PRESET_PLAYLISTS } from "../../content/presetPlaylists";

type Props = {
  onContinue: () => void;
  onBack?: () => void;
};

/** Pen screen 03 — catalog intro before choosing playlists. */
export function CuratedPlaylistsScreen({ onContinue, onBack }: Props) {
  const { s } = useLayout();
  const count = PRESET_PLAYLISTS.length;

  return (
    <ScreenShell accessibilityLabel="Curated playlists">
      <ScreenHeader
        section="Content setup"
        title="Curated playlists"
        subtitle="No YouTube sign-in. Pick from shows we bundled for kids TV."
      />
      <View style={[styles.row, { gap: s(28), marginTop: s(16) }]}>
        <View
          style={[
            styles.panel,
            { borderRadius: s(28), padding: s(36), flex: 1.4 },
          ]}
        >
          <View style={styles.point}>
            <View style={[styles.badge, { width: s(40), height: s(40), borderRadius: s(20) }]}>
              <Text style={[styles.badgeText, { fontSize: s(20) }]}>✓</Text>
            </View>
            <View style={styles.pointCopy}>
              <Text style={[styles.pointLabel, { fontSize: s(22) }]}>Catalog</Text>
              <Text style={[styles.pointBody, { fontSize: s(28), lineHeight: s(36) }]}>
                Little Bear, Franklin, Bear in the Big Blue House, and more
              </Text>
            </View>
          </View>
          <View style={[styles.point, { marginTop: s(36) }]}>
            <View style={[styles.badge, { width: s(40), height: s(40), borderRadius: s(20) }]}>
              <Text style={[styles.badgeText, { fontSize: s(20) }]}>✓</Text>
            </View>
            <View style={styles.pointCopy}>
              <Text style={[styles.pointLabel, { fontSize: s(22) }]}>
                Parent selects
              </Text>
              <View
                style={[
                  styles.callout,
                  {
                    borderRadius: s(20),
                    paddingVertical: s(28),
                    paddingHorizontal: s(24),
                    marginTop: s(12),
                  },
                ]}
              >
                <Text style={[styles.calloutText, { fontSize: s(28) }]}>
                  Select one or more playlists
                </Text>
              </View>
            </View>
          </View>
        </View>
        <View
          style={[
            styles.side,
            { borderRadius: s(28), padding: s(28), flex: 0.75 },
          ]}
        >
          <View
            style={[
              styles.sideArt,
              { borderRadius: s(12), minHeight: s(180) },
            ]}
          >
            <Text style={{ fontSize: s(72), color: colors.offWhite }}>▶</Text>
          </View>
          <Text style={[styles.sideCaption, { fontSize: s(20) }]}>
            {count} shows in the catalog
          </Text>
        </View>
      </View>
      <View style={styles.footer}>
        {onBack ? (
          <TvButton label="Back" variant="secondary" onPress={onBack} />
        ) : (
          <View />
        )}
        <TvButton
          label="Choose playlists"
          onPress={onContinue}
          {...({ hasTVPreferredFocus: true } as object)}
        />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
    alignItems: "stretch",
  },
  panel: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.white10,
    minWidth: 0,
  },
  point: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  badge: {
    backgroundColor: colors.coral,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: colors.navy, fontWeight: "700" },
  pointCopy: { flex: 1, minWidth: 0, gap: 6 },
  pointLabel: { color: colors.muted, fontWeight: "600" },
  pointBody: { color: colors.offWhite, fontWeight: "700" },
  callout: {
    backgroundColor: colors.panel2,
    borderWidth: 2,
    borderColor: colors.coral,
  },
  calloutText: { color: colors.offWhite, fontWeight: "700", textAlign: "center" },
  side: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.white10,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    minWidth: 0,
  },
  sideArt: {
    alignSelf: "stretch",
    flex: 1,
    backgroundColor: colors.panel2,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 0,
  },
  sideCaption: { color: colors.muted, fontWeight: "500", textAlign: "center" },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "auto",
    flexShrink: 0,
    paddingTop: 12,
  },
});
