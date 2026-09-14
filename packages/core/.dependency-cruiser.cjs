/** @type {import("dependency-cruiser").IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-react-native-in-core",
      comment:
        "RN-D2: packages/core cannot import react, react-native, or expo.",
      severity: "error",
      from: {},
      to: {
        path: "(^|/)(react|react-dom|react-native|react-native-tvos|expo)(/|$)|^(react|react-dom|react-native|expo)$",
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    tsConfig: { fileName: "tsconfig.json" },
  },
};
