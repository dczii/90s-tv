import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { PRODUCT_NAME } from "@nostalgiabox/core";

const NAVY = "#0E1016";
const OFF_WHITE = "#F4EFE6";

export default function App() {
  return (
    <View style={styles.shell} accessibilityLabel={PRODUCT_NAME}>
      <StatusBar hidden />
      <Text style={styles.title}>{PRODUCT_NAME}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 96,
    paddingVertical: 54,
  },
  title: {
    color: OFF_WHITE,
    fontSize: 42,
    fontWeight: "600",
  },
});
