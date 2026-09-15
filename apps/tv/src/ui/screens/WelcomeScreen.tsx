import { StyleSheet, Text, View } from "react-native";
import { ENFORCEMENT_NOTE, PRODUCT_NAME } from "@littleplay/core";
import { TvButton } from "../components/TvButton";
import { colors, safe } from "../../theme/tokens";

type Props = { onStart: () => void };

export function WelcomeScreen({ onStart }: Props) {
  return (
    <View style={styles.shell} accessibilityLabel="Welcome">
      <Text style={styles.title}>{PRODUCT_NAME}</Text>
      <Text style={styles.body}>
        A parent sets a PIN, watch and rest times, and which YouTube videos are
        allowed. Watching only starts when someone presses Continue watching.
      </Text>
      <TvButton
        label="Set up with parent PIN"
        onPress={onStart}
        {...({ hasTVPreferredFocus: true } as object)}
      />
      <Text style={styles.note}>{ENFORCEMENT_NOTE}</Text>
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
    gap: 28,
  },
  title: { color: colors.offWhite, fontSize: 48, fontWeight: "700" },
  body: { color: colors.offWhite, fontSize: 26, maxWidth: 1100, lineHeight: 36 },
  note: { color: colors.slateMuted, fontSize: 20, maxWidth: 1100, lineHeight: 28 },
});
