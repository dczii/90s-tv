const {
  AndroidConfig,
  withAndroidManifest,
  withMainActivity,
} = require("expo/config-plugins");

/**
 * Leanback extras config-tv does not own: touchscreen not required,
 * allowBackup=false, landscape, FLAG_KEEP_SCREEN_ON (RN-D4, RN-D11).
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

function withLittlePlay(config) {
  config = withAndroidManifest(config, (mod) => {
    const manifestXml = mod.modResults;
    ensureUsesFeature(manifestXml, "android.hardware.touchscreen", false);
    // Optional so Play still offers the app on TVs whose catalog omits leanback.
    ensureUsesFeature(manifestXml, "android.software.leanback", false);

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
      // Keep the phone launcher so Play offers the app on sticks its catalog
      // does not classify as Android TV. Leanback launcher stays for real TVs.
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
