module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // Must be last. babel-preset-expo 57.0.11 does not auto-add this.
    plugins: ["react-native-worklets/plugin"],
  };
};
