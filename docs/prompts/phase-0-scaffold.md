# Kickoff prompt — Phase 0 (Scaffold)

Copy everything below the rule into a fresh session on this repo.

---

Implement **Phase 0 (Scaffold)** of the Nostalgia Box delivery plan.

**Read first:** `docs/PLAN.md` (Phase P0), `docs/ARCHITECTURE.md` (§3, §9), `docs/PRD.md` (FR14).

**Branch:** develop on `claude/nostalgia-box-scaffold-<suffix>`, commit, push. No PR.

**Requires an Android SDK.** If `dl.google.com` is unreachable in your environment, you
cannot complete this phase — stop and say so rather than working around it. Phase 1 is
deliberately buildable without one; this phase is not.

## Decisions assumed

- **D2.** `minSdk 24`, not the PRD's 21. It covers essentially all active Android TV
  hardware and avoids a long tail of Media3, foreground-service and storage workarounds.
- `compileSdk` and `targetSdk` at current stable.

## Scope

Gradle project, two modules, and an installable app that launches to a black screen.

**Out of scope:** any behaviour. No playback, no networking, no persistence, no UI
beyond an empty Activity. If you are writing logic, you have left the phase.

## Build

- `settings.gradle.kts` with `:core` and `:app`
- `gradle/libs.versions.toml` — pin **every** version, no floating declarations
- `:core` as a **plain Kotlin/JVM module** with the Android Gradle plugin *not applied*
  (see Non-negotiables). If Phase 1 already created it, leave it alone.
- `:app` — Android application module, `minSdk 24`
- `AndroidManifest.xml`:
  - `LEANBACK_LAUNCHER` intent category (FR14)
  - `android:banner` pointing at a 320×180 drawable
  - `<uses-feature android:name="android.software.leanback" android:required="true"/>`
  - `<uses-feature android:name="android.hardware.touchscreen" android:required="false"/>`
- `TvActivity` — full screen, landscape, no action bar, `keepScreenOn`
- CI: one job building both modules, one job running `:core` tests

## Non-negotiables

1. **Do not apply the Android Gradle plugin to `:core`, and do not add any `androidx.*`
   or `android.*` dependency to it.** That absence is a compiler-enforced boundary, not
   a convention — the entire Phase 1 test strategy depends on `:core` building without
   an SDK.
2. **The `:core` test job in CI must not depend on the Android build job.** They run
   independently. If the Android job can't run in some environment, `:core` tests still must.
3. **`touchscreen required="false"` is not optional.** Omit it and the app will not
   install on, or appear on, a TV device — FR14 fails and the cause is non-obvious.
4. **A TV banner is not a launcher icon.** 320×180, referenced from
   `<application android:banner>`. Without it the home-row entry is blank.
5. No floating versions (`+`, `latest.release`). This app must build identically in
   six months.

## Exit criteria

- APK installs on the target device and **appears in the Google TV apps row with its banner**
- Launches to black without crashing; no action bar, landscape, screen stays on
- `./gradlew :core:test` succeeds on a machine with no Android SDK
- **FR14 satisfied**

## Report back

The module layout as built, the pinned versions in the catalog, and anything about the
target device (D6) you learned while installing — screen density, Android version,
launcher behaviour.
