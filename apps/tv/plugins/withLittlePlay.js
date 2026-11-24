const {
  AndroidConfig,
  withAndroidManifest,
  withMainActivity,
} = require("expo/config-plugins");

/**
 * Leanback extras config-tv does not own: touchscreen not required,
 * allowBackup=false, landscape, FLAG_KEEP_SCREEN_ON (RN-D4, RN-D11).
 *
 * Phones, tablets, and TVs share this manifest. Leanback stays optional,
 * the phone launcher stays present, and screen-size filters cannot drop
 * small or normal screens.
 *
 * Listed first in app.json plugins so this wrapper is outermost and runs
 * after @react-native-tvos/config-tv (which strips orientation).
 */
function ensureUsesFeature(manifestXml, name, required) {
  const manifest = manifestXml.manifest;
  if (!manifest["uses-feature"]) {
    manifest["uses-feature"] = [];
  }
  const features = Array.isArray(manifest["uses-feature"])
    ? manifest["uses-feature"]
    : [manifest["uses-feature"]];
  manifest["uses-feature"] = features;
  const existing = features.find((feature) => feature.$["android:name"] === name);
  if (existing) {
    existing.$["android:required"] = required ? "true" : "false";
  } else {
    features.push({
      $: {
        "android:name": name,
        "android:required": required ? "true" : "false",
      },
    });
  }
}

function relaxRequiredFeature(manifestXml, name) {
  const features = manifestXml.manifest["uses-feature"];
  const list = !features ? [] : Array.isArray(features) ? features : [features];
  for (const feature of list) {
    if (feature.$["android:name"] === name && feature.$["android:required"] === "true") {
      feature.$["android:required"] = "false";
    }
  }
}

function keepAllScreenSizes(manifestXml) {
  const manifest = manifestXml.manifest;
  delete manifest["compatible-screens"];
  const supports = manifest["supports-screens"];
  if (!supports) return;
  const node = Array.isArray(supports) ? supports[0] : supports;
  if (!node?.$) return;
  node.$["android:smallScreens"] = "true";
  node.$["android:normalScreens"] = "true";
  node.$["android:largeScreens"] = "true";
  node.$["android:xlargeScreens"] = "true";
  node.$["android:anyDensity"] = "true";
}

function withLittlePlay(config) {
  config = withAndroidManifest(config, (mod) => {
    const manifestXml = mod.modResults;
    ensureUsesFeature(manifestXml, "android.hardware.touchscreen", false);
    // Optional so Play offers the app on phones, tablets, and TVs whose
    // catalog omits leanback.
    ensureUsesFeature(manifestXml, "android.software.leanback", false);
    // screenOrientation=landscape implies this feature is required. Play then
    // hides the app from devices that do not declare a landscape screen.
    ensureUsesFeature(manifestXml, "android.hardware.screen.landscape", false);
    relaxRequiredFeature(manifestXml, "android.hardware.type.television");
    keepAllScreenSizes(manifestXml);

    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifestXml);
    application.$["android:allowBackup"] = "false";

    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(manifestXml);
    activity.$["android:screenOrientation"] = "landscape";

    const filters = activity["intent-filter"];
    const filterList = !filters ? [] : Array.isArray(filters) ? filters : [filters];
    for (const filter of filterList) {
      let categories = filter.category || [];
      if (!Array.isArray(categories)) categories = [categories];
      const names = new Set(categories.map((category) => category.$["android:name"]));
      // Phone launcher for phones, tablets, and sticks Play does not classify
      // as Android TV. Leanback launcher stays for real TVs.
      names.add("android.intent.category.LAUNCHER");
      names.add("android.intent.category.LEANBACK_LAUNCHER");
      filter.category = [...names].map((name) => ({
        $: { "android:name": name },
      }));
    }

    return mod;
  });

  config = withMainActivity(config, (mod) => {
    let src = mod.modResults.contents;
    if (!src.includes("FLAG_KEEP_SCREEN_ON")) {
      const flag =
        "window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);";
      if (src.includes("super.onCreate(")) {
        src = src.replace(
          /super\.onCreate\([^)]*\)/,
          (match) => `${match}\n    ${flag}`,
        );
      }
    }
    mod.modResults.contents = src;
    return mod;
  });

  return config;
}

module.exports = withLittlePlay;
