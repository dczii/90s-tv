# Step 1 — Stack, module map, and inherited product law

**Parent:** [React Native Five-Step Plan](../REACT_NATIVE_PLAN.md) §1
**Status:** done. Product docs and Expo TV shell landed. Debug APK
`com.nostalgiabox.tv` assembled on this host (Leanback launchable
activity, 320×180 banner, minSdk 24, landscape, `FLAG_KEEP_SCREEN_ON`).
No Android TV system image is installed here, so Apps-row visual on an
emulator/D6 is still outstanding. `pnpm test` is green on Node.
**Blocked on:** nothing. This track is chosen; do not implement Kotlin
Steps 2–5.
**Produces:** rewritten `docs/PRD.md` (product, shared with the Kotlin track),
rewritten `docs/ARCHITECTURE.md` **for React Native**, banners on the retired
Gradle/broadcast docs, and `apps/tv` launching to the brief’s navy background
with a Leanback banner.

---

## Goal

Lock how Timed YouTube TV is built in React Native without inventing new
timer policy. The child still watches curated YouTube inside this app for a
bounded window, then sits on a rest screen until **Continue watching**. The
player is still an IFrame in a WebView we destroy on expiry.

This step exists because the Kotlin architecture (`:core` JVM, Compose,
DataStore, Hilt) cannot be “adapted” into Expo. Replacement, not aliasing.

---

## Exit criterion

Copied from the parent plan and sharpened:

- [x] `docs/PRD.md` describes Timed YouTube TV (parent + child on Android TV).
      Old FR1–FR15 and broadcast §11 are gone. New numbered FRs match
      [`youtube-timer/05`](../youtube-timer/05-verify-policy-api-device.md)
      YT-D29 / the ten green lines. The enforcement paragraph is verbatim
      from [`youtube-timer/01`](../youtube-timer/01-product-and-timer-rules.md).
- [x] `docs/ARCHITECTURE.md` §1 states the monotonic-deadline hanging idea.
      §3 is the RN module map from [README](README.md), not `:core` / `:app`.
      Broadcast types are named as deleted. Kotlin YouTube-timer module
      guts are named as the *other* track, not as this one.
- [x] `YT-D1`–`YT-D7` are copied by reference (not rewritten). `RN-D1`–`RN-D11`
      below are in the architecture document.
- [x] `packages/core` is a workspace package whose test script runs with
      Node only. `apps/tv` prebuild + `assembleDebug` produced an APK with
      Leanback launcher entry, 320×180 banner, landscape, and
      keep-screen-on. Navy full-screen shell, no player. **Not done:**
      install on an Android TV emulator or D6 (this SDK has no `android-tv`
      system image).
- [x] Historical banners sit on `docs/PLAN.md`, `docs/prompts/README.md`,
      and `docs/youtube-timer/README.md`: Kotlin implementation is not this
      delivery track.

Checkable: a reader who has never seen the Gradle tree can implement Step 2
from the new architecture plus [02](02-persistent-timer-and-parent-controls.md).

---

## Read first

- [REACT_NATIVE_PLAN.md](../REACT_NATIVE_PLAN.md)
- [youtube-timer/01-product-and-timer-rules.md](../youtube-timer/01-product-and-timer-rules.md) (product law)
- [youtube-timer/README.md](../youtube-timer/README.md) (inherited decisions)
- [DESIGN_BRIEF.md](../../designs/DESIGN_BRIEF.md)
- [Expo: Build apps for TV](https://docs.expo.dev/guides/building-for-tv/)
- Existing `app/src/main/AndroidManifest.xml` (Leanback flags to preserve)

Do not read `designs/*.pen`. Do not implement `TimerEngine` in this step.
Do not add `react-native-webview` in this step.

---

## Product / user-visible outcome

This step owns one shipping screen: a full-screen navy shell that proves the
app is a TV app. Copy and rules the later screens obey come from the design
brief and YouTube-timer Step 1. After later steps the surface is unchanged:

| Brief screen | When it appears |
|---|---|
| Welcome / Parent setup | First launch; `TimerPhase.Setup` |
| Timer setup | First launch; durations + PIN create |
| Connect YouTube | First-run wizard (not PIN-gated) or Parent settings (PIN-gated) |
| Choose allowed content | First-run wizard (not PIN-gated) or Parent settings (PIN-gated) |
| Ready / Continue watching | `AwaitingConfirmation` |
| Playback | `Playing` only |
| Rest timer | `Resting` — player absent |
| Parent settings | PIN-gated |

Visual direction stays the brief: near-black navy, warm off-white, coral
primary, amber only for time warnings. D-pad, 1920×1080, 5% safe area.

---

## Technical design

### Inherited product (do not fork)

Copy these into the new PRD by reference to YouTube-timer 01. If a sentence
here drifts, 01 wins.

- Phases: `Setup → AwaitingConfirmation → Playing → Resting → AwaitingConfirmation`.
- Watch clock starts on `confirmWatching`, never on Setup complete or rest expiry.
- Rest deadline = watch-expiry instant + rest duration (YT-D3).
- Confirmation after every rest, including first launch after setup (YT-D4).
- Defaults 15/30; watch 5–60 step 5; rest 5–180 step 5; milliseconds (YT-D5).
- Verbatim enforcement paragraph on Welcome and Parent settings (YT-D7).
- IFrame in-process only; never download/extract streams; never launch the
  official YouTube app.
- Residual risks: official YouTube app, uninstall, data-clear, clock rollback.

### Repo layout

Workspace root stays this git repo. Add a package manager workspace (npm
or pnpm — lock **pnpm** at scaffold; Gradle already occupies `settings.gradle.kts`
naming). Do not put `package.json` over the Gradle root in a way that makes
`./gradlew :core:test` the default; the RN track’s default test is Vitest.

```
packages/core/          name: @nostalgiabox/core
apps/tv/                Expo app, name: tv, slug: timed-youtube-tv
apps/tv/modules/        local Expo modules (created in Steps 2 and 4)
```

Rejected: Expo app at repo root (clashes with Gradle `app/` and `android/`
once prebuild runs). Rejected: rewriting the existing `app/` Kotlin module
into RN (CNG will generate `apps/tv/android/`). Rejected: a third workspace
for “shared UI” — eight screens, one app.

`applicationId` / Android `package`: `com.nostalgiabox.tv`. Display name
Timed YouTube TV. Renaming the id is out of scope.

### Stack (RN-D1)

| Piece | Lock |
|---|---|
| App framework | Expo with continuous native generation |
| React Native | `react-native` alias `npm:react-native-tvos@<sdk-matched-stable>` |
| TV plugin | `@react-native-tvos/config-tv` with `isTV: true`, `androidTVRequired: true` |
| SDK | Current stable Expo SDK **at scaffold time**, pinned. Docs at writing used SDK 56 → `react-native-tvos@0.85-stable`. Re-read the [compatibility table](https://docs.expo.dev/guides/building-for-tv/) before pinning. |
| New Architecture | On (Fabric + Hermes). Required by current tvos. |
| Navigation | **None.** Phase-driven single tree. No `expo-router`, no stack. |
| Phone / Apple TV | Out. `android.software.leanback required=true`. Do not generate an iOS target for v1. |
| Expo Go | Out. Dev builds / `npx expo run:android` only. |

Template: `npx create-expo-app apps/tv -e with-tv` then move into the
workspace. Do **not** start from `with-router-tv` (BACK would pop rest).

Config plugin extras the TV plugin does not give us, via
`expo-build-properties` + a small local config plugin `withTimedYoutubeTv`:

- `minSdk 24` (not Expo’s default if higher is fine; do not go below 24).
- `touchscreen required=false`.
- 320×180 `android:banner`.
- `LEANBACK_LAUNCHER` (TV plugin adds TV intent; confirm banner + category).
- `FLAG_KEEP_SCREEN_ON` on the main activity (or `expo-keep-awake` activated
  for the whole session — same outcome; prefer the window flag so a JS
  exception cannot drop it).
- Landscape locked.
- `allowBackup=false`.

Rejected: bare `react-native init` (we still need Expo modules for SQLite,
SecureStore, and local native views). Rejected: targeting phone “for
faster iteration” — D-pad and Leanback bugs will not show up.

### `packages/core` boundary (RN-D2)

Plain TypeScript library. `"type": "module"`. Vitest. **Compiler and
linter enforced:** `package.json` has no dependency on `react`,
`react-native`, or `expo*`. A `dependency-cruiser` (or ESLint
`no-restricted-imports`) rule fails the test job if those appear.

This replaces `ModuleBoundaryTest`. The reason is identical: timer,
PIN, URL parse, and `nextPlayable` must run on this machine with Node.

Kover 100% on `TimerEngine` becomes Vitest coverage on `timerEngine.ts`
(100% branch/line, same as Kotlin Step 2).

### Native surface budget (RN-D3)

Only three local Expo modules, created when first needed:

| Module | Step | Why it cannot be JS |
|---|---|---|
| `device-time` | 2 | `SystemClock.elapsedRealtime()`, `Settings.Global.BOOT_COUNT` as string→`Int?` |
| `android-identity` | 3 | signing cert SHA-1 + package for Data API headers |
| `youtube-player` | 4 | `WebViewAssetLoader` + destroy order + JS bridge |

Everything else must be an Expo-supported-on-TV library (see Expo’s TV
library list) or pure JS. Adding a fourth local module is a Step 1
architecture amendment, not a drive-by.

Rejected: `react-native-quick-crypto` (native C++ / Nitro, not on the TV
support list; PIN is a verifier, not a wallet). Rejected:
`react-native-webview` for the player (`YT-D20` origin). Rejected: a
TimeView implementation that uses `Date.now()` plus
`performance.now()` — that is not `elapsedRealtime` and does not read
`BOOT_COUNT`.

### Persistence sketch (detail in Step 2)

- Timer + PIN verifier + allowlist cursor → `expo-sqlite` `kv`.
- Allowlist + catalog cache → `expo-sqlite` tables.
- OAuth tokens → `expo-secure-store` only.

### UI sketch (detail in Step 4)

Phase enum from core selects one screen component. `BackHandler` policy
from `YT-D25`. Focus via `Pressable` `focused` style and
`TVFocusGuideView`. No touch-only hit targets.

### Failure model (this step)

| Failure | Response |
|---|---|
| TV plugin without `react-native-tvos` alias | D-pad will not work; fix the alias before any UI |
| Prebuild without `EXPO_TV=1` / `isTV: true` | Phone manifest; will not show on the Apps row |
| Core imports `react-native` “just for types” | Boundary fail; put types in core, adapters in apps/tv |
| iOS directory generated | Delete / do not commit for v1; appleTV is out |

---

## Decisions already made (inherited)

`YT-D1`–`YT-D7` from YouTube-timer 01. `YT-D8`–`YT-D29` remain law for
later steps; this step does not reopen them.

---

## Decisions this step must lock

| ID | Decision | Lock |
|---|---|---|
| **RN-D1** | Stack | Expo CNG + `react-native-tvos` matching the pinned Expo SDK + `@react-native-tvos/config-tv` with `androidTVRequired: true`. No Expo Go. No phone. No Apple TV in v1. |
| **RN-D2** | Domain package | `packages/core` TypeScript. No `react` / `react-native` / `expo*`. Vitest on Node. |
| **RN-D3** | Native budget | Only `device-time`, `android-identity`, `youtube-player`. Fourth module = architecture change. |
| **RN-D4** | Identity | `applicationId` `com.nostalgiabox.tv`. `minSdk 24`. Leanback required, touchscreen not required, 320×180 banner. |
| **RN-D5** | Navigation | Phase-driven tree. No stack router. `BackHandler` cannot `finish` rest or confirmation. |
| **RN-D6** | Gradle tree | Historical. Not compiled on this track. Do not port broadcast types. |
| **RN-D7** | PIN KDF host | `@noble/hashes` PBKDF2-HMAC-SHA256 **in core** (async). Not `expo-crypto` (no PBKDF2). Not `SecretKeyFactory` (would force a native module and API 26). Same parameters as YT-D10: 16-byte salt, 32-byte dk, 120_000 iterations, timing-safe compare. |
| **RN-D8** | Player host | Custom `YoutubePlayerView` in Step 4. Stock `react-native-webview` is forbidden for playback. |
| **RN-D9** | D6 | Same as YT-D27: named SKU, default Chromecast with Google TV (4K). |
| **RN-D10** | Test split | Core Vitest **here**. `expo run:android` / assemble **on an SDK machine**. Never conflate (YT-D26 translated). |
| **RN-D11** | Keep-awake | Main activity `FLAG_KEEP_SCREEN_ON`. `expo-keep-awake` is not a substitute unless wired as a non-optional startup call with a native fallback. |

Rejected: “RN WebView `source={{ html }}` with `baseUrl: 'https://www.youtube.com'`”
— that is the `loadDataWithBaseURL` reject from YT-D20. Rejected: starting
the watch clock in JS `setInterval` without persisted deadlines. Rejected:
`expo-router` because BACK pops the rest screen.

---

## Scope in / Scope out

**In:** PRD rewrite (product). Architecture rewrite (RN). Workspace
scaffold. Leanback shell. Historical banners. Pin Expo/tvos versions.

**Out:** `TimerEngine`, PIN UI, OAuth, WebView, design polish of all eight
screens, deleting the Gradle tree (wait until Step 2 tests are green).

---

## What this step retires or amends

| Document / tree | Action |
|---|---|
| PRD §1–§13 | Rewrite for Timed YouTube TV (same product text as Kotlin Step 1) |
| ARCHITECTURE.md | Rewrite for Expo + `packages/core`. Kotlin `:core` map does not survive as law |
| PLAN.md / prompts | Banner: broadcast track is historical; RN track is `docs/react-native/` if chosen |
| youtube-timer/*.md | Remain **product** law. Implementation locks that name Gradle/Hilt/Compose are the other track |
| `core/` Kotlin broadcast | Do not delete yet; do not import |
| `app/` Kotlin `TvActivity` | Not the Activity this track launches |

---

## Non-negotiables

1. **Do not rewrite timer policy.** If Step 1 invents a fifth phase or
   starts the clock at Setup, stop and open YouTube-timer 01.
2. **Do not keep “playback position is a pure function of the wall clock”
   in ARCHITECTURE §1.**
3. **Do not add `react-native-webview` “to try YouTube quickly.”** That
   cements the wrong origin.
4. **Do not enable a phone target** for convenience.
5. **Do not put `TimerEngine` in a React context as the source of truth.**
   Core stays a plain class; the app holds one instance.

---

## Tests and verification

- Vitest in `packages/core` runs a placeholder `expect(true)` plus the
  boundary rule (importing `react-native` from a fixture file must fail
  the cruiser/lint job).
- APK or `expo run:android` on an Android TV emulator: Apps row, banner,
  navy screen, D-pad does not crash. **FR14 equivalent.**
- `./gradlew :core:test` is **not** a green criterion on this track.

---

## Implementation build order

1. Rewrite `docs/PRD.md` from YouTube-timer 01 (product only).
2. Rewrite `docs/ARCHITECTURE.md` for this module map; record `RN-D1`–`RN-D11`.
3. Banner PLAN / prompts / youtube-timer README (this track vs Kotlin track).
4. Add pnpm workspace, `packages/core` with Vitest + boundary lint.
5. Add `apps/tv` from `with-tv`, wire config-tv, minSdk 24, Leanback extras,
   `applicationId`, keep-screen-on.
6. Confirm TV emulator install. Stop.

---

## Open risks

| Risk | Mitigation |
|---|---|
| Implementers keep reading Kotlin Step 2 and add DataStore/Hilt | Architecture §3 is RN-only; this folder is the delivery track |
| `react-native-tvos` version skew with Expo SDK | Pin from Expo’s TV guide at scaffold; do not `expo install` a facebook RN |
| CNG wipes custom activity flags | Local config plugin, not hand-edits in `android/` that `--clean` destroys |
| Two `applicationId`s if someone scaffolds a new package name | RN-D4; fail CI if `applicationId` ≠ `com.nostalgiabox.tv` |
