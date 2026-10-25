// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
    rules: {
      // This app intentionally keeps mutable native-player/session handles in
      // refs. It is not compiled with React Compiler, whose lint rules reject
      // that established React Native pattern.
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);
