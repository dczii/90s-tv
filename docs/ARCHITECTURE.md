# Timed YouTube TV — Architecture (React Native track)

Companion to the PRD (v1.0 MVP). This document decides **how** this repo
builds Timed YouTube TV: Expo TV + a Node-testable TypeScript domain
package. Product law (`YT-D1`–`YT-D29`) lives in
[`youtube-timer/`](youtube-timer/README.md) and is not restated here except
by reference. Stack and native-seam locks (`RN-D1`–`RN-D19`) live here and
in [`react-native/`](react-native/README.md).

When the two disagree on *what the app does*, YouTube-timer wins. When they
disagree on *how it is built*, this file and `docs/react-native/` win.

Pick **one** delivery track. Kotlin Compose (`:core` / `:app`, DataStore,
Hilt) is the other track. It stays on disk as product reference and as an
abandoned rewrite. Do not compile it on this track. Do not implement both
against `com.nostalgiabox.tv`.

---

## 1. The one idea the whole app hangs on

> **Elapsed watch time advances with a monotonic clock. Pause, buffer, and
> backgrounding cannot extend the watch window. The player exists only in
> `Playing`, and `Playing` is entered only by Continue watching.**

The retired broadcast invariant — playback position is a pure function of
the wall clock — is **false** for this product. Do not implement a
modulo timeline, `TuneInResolver`, or “always live” seek.

Everything the PRD asks for falls out of the new idea:

| PRD requirement | How the hanging idea satisfies it |
|---|---|
| FR3 — Continue watching starts the clock | `confirmWatching` writes the watch deadline. Setup and rest expiry do not. |
| FR4 — pause/buffer/Home cannot extend | Deadline is monotonic elapsed time, not player `currentTime`. |
| FR5/FR6 — player gone at expiry | Phase `Playing` is the only legal host for the native player view. |
| FR7 — restart/reboot cannot reset | Deadlines persist. Recovery may skip rest *UI* if rest has also elapsed; it still lands on confirmation. |
| §11.6 — rest never autoplays | Rest expiry and `completeSetup` land on `AwaitingConfirmation`. No command autoplays. |

Deadlines persist across process death and TV reboot. Rest expiry does not
construct a player. The official YouTube app, uninstall, data-clear, and
clock rollback remain residual risks (PRD §6.2), not bugs.

---

## 2. What this architecture deletes

The broadcast architecture (old §2 A1–A8, old §4–§8) answered download and
tune-in questions this product does not ask. Those amendments are **not
law**.

**Named as deleted** (do not port; Gradle sources stay on disk until Step 2
tests are green):

`BroadcastClock`, `SystemBroadcastClock`, `Slot`, `Lineup`, `IdealSlot`,
`PlayableSlot`, `Channel`, `MediaFile`, `FileStatus`, `Manifest`,
`TuneInResolver`, `LineupBuilder`, `AvailabilityProjector`,
`ChannelSelector`, `ManifestDiffer`, `DriftCorrector`, `StorageBudget`,
`MediaPaths`, `manifest/` parser/validator/DTO/error types.

**Named as never built past a black `TvActivity`:** WorkManager media
downloads, Room file rows, ExoPlayer/Media3, content-addressed `media/`
cache, channel bug, no-signal slate, hidden manifest settings.

**Kotlin YouTube-timer module guts** (`:core` timer/PIN in Kotlin,
DataStore, Room, EncryptedSharedPreferences, Hilt, Compose TV,
`SecretKeyFactory` / `Mac("HmacSHA256")` in `:core`) are the *other*
track, not this one. Product decisions `YT-D1`–`YT-D29` still apply.

Old §1 (“playback position is a pure function of the wall clock”) is
retired, not adapted.

---

## 3. Module map

```
packages/core          @nostalgiabox/core — TypeScript, Node-testable
                       no react, no react-native, no expo
                       timer/   TimeView · TimerPolicy · TimerEngine
                       pin/     PinHasher · PinGate   (@noble/hashes PBKDF2-SHA256)
                       allowlist/  AllowlistEntry · YoutubeUrlParser · nextPlayable

apps/tv                Expo (CNG) + react-native-tvos
                       plugins/withTimedYoutubeTv.js
                       modules/device-time        Step 2 — elapsedRealtime + wall + BOOT_COUNT
                       modules/android-identity   Step 3 — package name + signing cert SHA-1
                       modules/youtube-player     Step 4 — WebViewAssetLoader + IFrame host
                       src/time/                  deviceTime() adapter
                       src/data/                  expo-sqlite kv + allowlist + catalog
                       src/secure/                expo-secure-store tokens
                       src/youtube/               device-code OAuth + Data API
                       src/player/                JS PlayerSession wrapping native view
                       src/ui/                    phase-driven screens (no stack router)
```

Keep `applicationId` `com.nostalgiabox.tv`. Display name Timed YouTube TV.
Renaming the id is out of scope.

**Why split at all, for an app this size?** Same three reasons as the
Kotlin split, translated:

1. Timer, PIN, URL parse, and `nextPlayable` are pure and deterministic.
   Isolating them in a package that *cannot* import React Native makes that
   a linter-enforced property rather than a code-review convention.
2. Vitest runs on this machine with Node. No JDK, no Android SDK, no
   emulator. That is the only part of the system this environment can fully
   verify (see §13).
3. The seam is where native time, SQLite, Keystore, and the player view
   attach.

Anything beyond `packages/core` + `apps/tv` is overhead at this size. No
shared-UI workspace. Local Expo modules live under `apps/tv/modules/` and
count against the native budget (§5).

The Gradle tree (`:core`, `:app`, `settings.gradle.kts`) is historical on
this track (`RN-D6`). `./gradlew :core:test` is **not** a green criterion
here. Default `pnpm test` runs `@nostalgiabox/core`.

---

## 4. Domain package (`packages/core`)

Implemented in Step 2. Timer phase machine, dual-clock recovery, and PIN
gate live here.

- `"type": "module"`. Vitest. No dependency on `react`, `react-native`, or
  `expo*`.
- A `dependency-cruiser` rule fails the test job if those imports appear.
  This replaces `ModuleBoundaryTest`.
- `TimerEngine` is a plain class. The app holds one instance. Do not put
  the engine in a React context as the source of truth.
- PIN KDF is `@noble/hashes` PBKDF2-HMAC-SHA256 **in core**, async
  (`RN-D7`). Same parameters as `YT-D10`: 16-byte salt, 32-byte dk,
  120_000 iterations, timing-safe compare. Not `expo-crypto` (no PBKDF2).
  Not `SecretKeyFactory` (would force a native module and API 26).
- Vitest coverage on `timerEngine.ts` is 100% branch/line.

`TimeView` is an interface core owns. `apps/tv` supplies it from the
`device-time` native module: `elapsedRealtime` + wall + `BOOT_COUNT` as
`number | null`. Missing boot count is `null`, never `0`.
`Date.now() + performance.now()` is not `elapsedRealtime` and does not
read `BOOT_COUNT`.

---

## 5. Native surface budget

Only three local Expo modules, created when first needed (`RN-D3`):

| Module | Step | Why it cannot be JS |
|---|---|---|
| `device-time` | 2 | `SystemClock.elapsedRealtime()`, `Settings.Global.BOOT_COUNT` as string→`number \| null` |
| `android-identity` | 3 | signing cert SHA-1 + package for Data API `X-Android-Package` / `X-Android-Cert` |
| `youtube-player` | 4 | `WebViewAssetLoader` + destroy order + JS bridge |

Adding a fourth local module is an architecture amendment, not a drive-by.

Rejected: `react-native-quick-crypto`. Rejected: `react-native-webview` for
the player (`YT-D20` origin). Rejected: `expo-router` (BACK would pop
rest). Rejected: a phone target “for faster iteration.”

---

## 6. Persistence sketch (detail in Step 2–3)

- Timer + PIN verifier + allowlist cursor → `expo-sqlite` table `kv`.
- Allowlist + catalog cache → `expo-sqlite` tables.
- OAuth tokens → `expo-secure-store` only (Keystore-backed on Android).
- Never store the PIN.

---

## 7. Player host (detail in Step 4)

Custom Expo native view `YoutubePlayerView`: `WebViewAssetLoader` + IFrame
Player API. Origin `https://appassets.androidplatform.net/`. `loadVideo`
only. Destroy the native WebView on any phase whose `to` is not `Playing`.

Stock `react-native-webview` is forbidden for playback (`RN-D8`). So is
`source={{ html }}` with `baseUrl: 'https://www.youtube.com'` (that is the
`loadDataWithBaseURL` reject from `YT-D20`).

If the iframe cannot play on the named TV after origin triage (`YT-D28`),
**stop**. No ExoPlayer, `expo-video`, download/extract, or
`Linking.openURL` to YouTube.

---

## 8. UI

Phase enum from core selects one screen component. No `expo-router`, no
stack (`RN-D5`). `BackHandler` policy from `YT-D25`: BACK cannot `finish`
rest or confirmation.

Focus via `Pressable` `focused` style and `TVFocusGuideView`. No
touch-only hit targets. Eight design-brief screens, D-pad-first,
1920×1080, 5% safe area. Step 1 ships only the navy Leanback shell; later
steps fill the tree.

Keep-screen-on is a window flag on the main activity (`RN-D11`), not an
optional JS `expo-keep-awake` call a thrown render can skip.

---

## 9. Cross-cutting locks

### Inherited product (`YT-D1`–`YT-D7`)

Copied by reference from
[`youtube-timer/01-product-and-timer-rules.md`](youtube-timer/01-product-and-timer-rules.md).
Do not rewrite them here. `YT-D8`–`YT-D29` remain law for later steps.

### Decisions this track locks

| ID | Decision | Lock |
|---|---|---|
| **RN-D1** | Stack | Expo CNG + `react-native-tvos` matching the pinned Expo SDK + `@react-native-tvos/config-tv` with `isTV: true` and `androidTVRequired: true`. No Expo Go. No phone. No Apple TV in v1. New Architecture on (Fabric + Hermes). |
| **RN-D2** | Domain package | `packages/core` TypeScript. No `react` / `react-native` / `expo*`. Vitest on Node. |
| **RN-D3** | Native budget | Only `device-time`, `android-identity`, `youtube-player`. Fourth module = architecture change. |
| **RN-D4** | Identity | `applicationId` `com.nostalgiabox.tv`. `minSdk 24`. Leanback required, touchscreen not required, 320×180 banner. |
| **RN-D5** | Navigation | Phase-driven tree. No stack router. `BackHandler` cannot `finish` rest or confirmation. |
| **RN-D6** | Gradle tree | Historical. Not compiled on this track. Do not port broadcast types. |
| **RN-D7** | PIN KDF host | `@noble/hashes` PBKDF2-HMAC-SHA256 **in core** (async). Parameters as `YT-D10`. |
| **RN-D8** | Player host | Custom `YoutubePlayerView` in Step 4. Stock `react-native-webview` is forbidden for playback. |
| **RN-D9** | D6 | Same as `YT-D27`: named SKU, default Chromecast with Google TV (4K). |
| **RN-D10** | Test split | Core Vitest **here**. `expo run:android` / assemble **on an SDK machine**. Never conflate. |
| **RN-D11** | Keep-awake | Main activity `FLAG_KEEP_SCREEN_ON`. |
| **RN-D12** | Time source | Expo module `device-time`. `bootCount` from `Settings.Global.getString`; missing ≠ 0. |
| **RN-D13** | KV store | `expo-sqlite` table `kv`, keys identical to YouTube-timer 02. |
| **RN-D14** | Engine lifetime | One `TimerEngine` per JS runtime, created after kv read, held outside React. React subscribes to snapshots. |
| **RN-D15** | Resume | Native `onActivityResume` + AppState; tick then snapshot then maybe player. |
| **RN-D16** | HTTP | `fetch` in `apps/tv`. No OkHttp wrapper unless `fetch` cannot set the Android headers (it can). |
| **RN-D17** | Tokens | `expo-secure-store` only. Disconnect keeps allowlist. |
| **RN-D18** | Identity | Native `android-identity` for package + cert SHA-1 on API-key calls. |
| **RN-D19** | Catalog DB | Same sqlite file as timer `kv`. New tables; not a second database. |

### Pinned versions (scaffold time)

Current stable Expo SDK at writing is **57** (React Native 0.86, React
19.2.3). Pin:

| Piece | Pin |
|---|---|
| Expo SDK | `expo@~57.0.13` (template-aligned; bump only with a TV-compat re-read) |
| React Native TV | `react-native` alias `npm:react-native-tvos@0.86-stable` |
| TV plugin | `@react-native-tvos/config-tv` with `isTV: true`, `androidTVRequired: true` |
| Node (app / Expo CLI) | 22.13.x per Expo’s SDK 57 table. This host also has 22.12 via nvm. |
| Node (`packages/core`) | 20+ is enough; Vitest must keep running without the Android SDK. |

Do not `expo install` facebook `react-native`. Do not generate an iOS
directory for v1; if prebuild creates one, delete it and do not commit it.

Config plugin extras the TV plugin does not give us, via
`expo-build-properties` + local `withTimedYoutubeTv`:

- `minSdk 24` (do not go below 24).
- `touchscreen required=false`.
- 320×180 `android:banner` (also passed as `androidTVBanner` to config-tv).
- `LEANBACK_LAUNCHER` (confirm; TV plugin adds the TV intent).
- `FLAG_KEEP_SCREEN_ON` on the main activity.
- Landscape locked.
- `allowBackup=false`.

Workspace: **pnpm**. Root `package.json` exists for the JS workspace and
must not make `./gradlew :core:test` the default test. Rejected: Expo app
at repo root (clashes with Gradle `app/` and with `android/` once prebuild
runs). Rejected: rewriting the existing `app/` Kotlin module into RN.

**DI** — none. Composition root in `apps/tv/src/app/container.ts` (Step 2).
Hilt does not apply.

**Network** — `fetch` in JS. Unauthenticated Data API calls add
`X-Android-Package` and `X-Android-Cert` from `android-identity` (Step 3).

**Observability** — no analytics (PRD non-goal).

---

## 10. Build order

This folder is the delivery track, not PLAN.md’s P0–P7 download/ExoPlayer
sequence.

| # | Step | Ends when |
|---|---|---|
| 1 | Stack, module map, inherited product | Product rules inherited; RN architecture locked; Expo TV shell installs |
| 2 | Persistent timer and parent controls | Closing or restarting cannot reset either timer; PIN-gated settings stay gated; `packages/core` tests pass on Node |
| 3 | YouTube connection and curation | A parent can persist a playable allowlist from an account or from manual links |
| 4 | Controlled Android TV playback | Only curated IDs play; the WebView is gone when the watch deadline hits |
| 5 | Verify policy, API, and device | Core tests here; assemble on an SDK machine; full cycle on the named TV |

Implementation-grade locks: [`react-native/`](react-native/README.md).

---

## 11. Answers to the PRD’s open questions

**OAuth client / API key?**
Step 3. Device-code (RFC 8628), `youtube.readonly` only. Not a timer-policy
question.

**D6 SKU?**
Default **Chromecast with Google TV (4K)**. If the team owns a different
Google TV, write that SKU in YouTube-timer 05 / RN 05 before Step 4
hardware claims. “Google TV” is not a device.

**Hosted manifest / five channels / Range / GOP / MediaSession?**
Retired with the broadcast product. Not applicable.

---

## 12. Known risks

| Risk | Mitigation |
|---|---|
| Official YouTube app, uninstall, data-clear, clock rollback | Residual; verbatim Welcome/settings copy; not fail criteria |
| Implementers keep reading PLAN.md and rebuild ExoPlayer | Banners on PLAN/prompts; this file’s §3 is RN-only; Step 4 forbids fallbacks |
| `react-native-tvos` version skew with Expo SDK | Pin from Expo’s TV guide at scaffold; do not `expo install` facebook RN |
| CNG wipes custom activity flags | Local config plugin, not hand-edits in `android/` that `--clean` destroys |
| Two `applicationId`s | RN-D4; `apps/tv` identity must stay `com.nostalgiabox.tv` |
| Phone prebuild (`EXPO_TV` unset / `isTV` false) | Plugin parameters force TV; do not generate a phone manifest |
| IFrame incompatible on D6 | Origin triage then platform blocker; halt; no fallback player |
| This host mistaken for an SDK host | RN-D10; §13 |

---

## 13. Environment note

This development machine runs Node (nvm 22.12 for Expo SDK 57; 20.19 is
enough for `packages/core`). Record what actually ran; do not invent
assemble results.

On 2026-09-14 this host:

- Ran `pnpm test` (`@nostalgiabox/core` Vitest + dependency-cruiser) green.
- Ran `EXPO_TV=1 expo prebuild --platform android --clean`.
- Ran `apps/tv/android` `:app:assembleDebug` with JDK 17 and
  `~/Library/Android/sdk` (`minSdk 24`, Leanback launchable activity,
  320×180 banner). `ANDROID_HOME` is not set by default in the shell.
- Did **not** install onto an Android TV emulator or D6 — no `android-tv`
  system image is present in this SDK.

Consequences:

- `@nostalgiabox/core` can be fully built and tested here — which is a
  large part of why it is a separate package (§3, `RN-D2`, `RN-D10`).
- Device/emulator visual (navy Apps-row launch) still needs a TV image or
  the named D6 SKU.
- `./gradlew :core:test` (repo-root Gradle) is the other track. Do not use
  it as a green criterion on this one.

The original authoring container’s `dl.google.com` block is historical.
