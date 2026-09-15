import { StyleSheet, Text, View } from "react-native";
import { BrandRow, ScreenShell } from "../components/ScreenChrome";
import { TvButton } from "../components/TvButton";
import { colors, useLayout } from "../../theme/tokens";

type Props = { onStart: () => void };

export function WelcomeScreen({ onStart }: Props) {
  const { s } = useLayout();
  return (
    <ScreenShell accessibilityLabel="Welcome" atmosphere="welcome">
      <BrandRow />
      <View style={styles.body}>
        <View style={styles.copy}>
          <Text
            style={[styles.headline, { fontSize: s(72), lineHeight: s(86) }]}
          >
            A little TV.{"\n"}Then a real break.
          </Text>
          <Text style={[styles.sub, { fontSize: s(28), lineHeight: s(38) }]}>
            Curated YouTube for your home, with clear watch and rest windows.
          </Text>
          <TvButton
            label="Get started"
            onPress={onStart}
            {...({ hasTVPreferredFocus: true } as object)}
          />
          <Text style={[styles.note, { fontSize: s(20) }]}>
            Time limits apply inside LittlePlay only.
          </Text>
        </View>
        <View
          style={[
            styles.preview,
            { borderRadius: s(40), padding: s(28) },
          ]}
        >
          <View
            style={[
              styles.previewArt,
              { borderRadius: s(24), minHeight: s(200) },
            ]}
          >
            <Text style={[styles.previewGlyph, { fontSize: s(56) }]}>▶</Text>
          </View>
          <Text
            style={[styles.previewTime, { fontSize: s(88), lineHeight: s(100) }]}
          >
            15:00
          </Text>
          <Text style={[styles.previewLabel, { fontSize: s(18) }]}>
            WATCH WINDOW
          </Text>
        </View>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 48,
    minHeight: 0,
  },
  copy: { flex: 1.15, gap: 22, minWidth: 0, justifyContent: "center" },
  headline: { color: colors.offWhite, fontWeight: "700" },
  sub: { color: colors.muted, maxWidth: "88%", fontWeight: "400" },
  note: { color: colors.muted },
  preview: {
    flex: 0.78,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.white10,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    alignSelf: "stretch",
    maxHeight: "72%",
  },
  previewArt: {
    alignSelf: "stretch",
    backgroundColor: "#22364C",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    minHeight: 0,
  },
  previewGlyph: { color: colors.offWhite, opacity: 0.85 },
  previewTime: { color: colors.offWhite, fontWeight: "700" },
  previewLabel: {
    color: colors.amber,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
});
