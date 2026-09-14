# Timed YouTube TV — React Native Five-Step Plan

This is an **alternative delivery track** for the same product as
[`YOUTUBE_TIMER_PLAN.md`](YOUTUBE_TIMER_PLAN.md): a parent-configured YouTube
timer for Android TV. It does not change timer rules, PIN policy, allowlist
semantics, IFrame-only playback, or residual risk.

Pick **one** track. Do not implement Kotlin Compose *and* React Native in
parallel against the same `applicationId`.

| Track | Where | UI | Domain |
|---|---|---|---|
| Kotlin (original rewrite) | [`docs/youtube-timer/`](youtube-timer/README.md) | Compose TV | `:core` Kotlin/JVM |
| React Native (this file) | [`docs/react-native/`](react-native/README.md) | `react-native-tvos` | `packages/core` TypeScript |

Product law (`YT-D1`–`YT-D29`) lives in the YouTube-timer step files. This
folder only adds `RN-D*` locks (stack, module map, native seams). When the
two disagree on *what the app does*, YouTube-timer wins. When they disagree
on *how it is built*, this folder wins.

The timer is still enforced only inside this app. It cannot prevent viewing
in the official YouTube app or protect against uninstalling the app, clearing
its data, or changing the device clock.

## Why React Native does not remove native Android

The product already isolated the hard logic in a JVM-only `:core`. React
Native is a UI and adapter rewrite, not an escape from Android TV:

- Leanback launcher, `BOOT_COUNT`, `elapsedRealtime`, Keystore, and
  `WebViewAssetLoader` are OS APIs. They stay in Kotlin Expo modules.
- The YouTube IFrame origin lock (`YT-D20`) is rejected by stock
  `react-native-webview` (`file://` / no `shouldInterceptRequest`). The
  player is a custom native view.
- D-pad focus is a fork (`react-native-tvos`), not facebook/react-native.

What RN *does* buy: one TypeScript domain package that tests on this machine
with Node (no JDK required for the timer), and UI that is not Compose-TV-
specific. What it costs: a second-class TV focus engine, a custom player
view, and Expo CNG instead of the existing Gradle scaffold.

## Step plans

Implementation-grade plans live in [`docs/react-native/`](react-native/README.md).
This file owns the five-step list and the exit sentences.

1. [Stack, module map, and inherited product law](react-native/01-stack-and-module-map.md)
2. [Persistent timer and parent controls](react-native/02-persistent-timer-and-parent-controls.md)
3. [YouTube connection and curation](react-native/03-youtube-connection-and-curation.md)
4. [Controlled Android TV playback](react-native/04-controlled-android-tv-playback.md)
5. [Verify policy, API, and device](react-native/05-verify-policy-api-device.md)

## 1. Lock the stack and inherit the product

- Treat [`youtube-timer/01`](youtube-timer/01-product-and-timer-rules.md) as
  the product spec. Do not re-litigate phases, confirmation, ranges, or the
  enforcement paragraph.
- Rewrite `docs/PRD.md` for Timed YouTube TV (same as Kotlin Step 1).
- Write `docs/ARCHITECTURE.md` for **this** track (Expo TV + `packages/core`),
  not for `:core` / Compose.
- Scaffold `apps/tv` from Expo's TV template and `packages/core` as a Node
  package that cannot import `react-native`.

**Exit:** A reader can implement Step 2 from the new architecture plus
[02](react-native/02-persistent-timer-and-parent-controls.md) without opening
Gradle Kotlin sources.

## 2. Build the persistent timer and parent controls

- Port `TimerEngine` / `PinGate` to TypeScript in `packages/core`.
- Supply `TimeView` from a native Expo module (`elapsedRealtime` + wall +
  `BOOT_COUNT: number | null`).
- Persist timer + PIN verifier in `expo-sqlite`; never store the PIN.
- Wire Welcome, Timer setup, PIN cells, and Parent settings as D-pad screens.

**Exit:** Closing or restarting the app cannot reset either timer, and
protected settings cannot be changed without the PIN.
`packages/core` tests pass on this machine with Node only.

## 3. Add YouTube connection and content curation

- RFC 8628 device-code OAuth in JS (`youtube.readonly` only).
- Store tokens in `expo-secure-store` (Keystore-backed on Android).
- Persist the allowlist in SQLite. Manual URLs are a peer path.
- Send `X-Android-Package` and `X-Android-Cert` on unauthenticated Data API
  calls (native signing identity).

**Exit:** A parent can create and persist a playable allowlist using either a
connected account or manual YouTube links.

## 4. Implement controlled Android TV playback

- Custom Expo native view: `WebViewAssetLoader` + IFrame Player API.
  Origin `https://appassets.androidplatform.net/`. `loadVideo` only.
- Destroy the native WebView on any phase whose `to` is not `Playing`.
- Rest expiry must not mount the player view. Continue watching is the only
  door into a new watch window.
- Eight design-brief screens, D-pad-first, 1920×1080, 5% safe area.

**Exit:** Playback is limited to curated video IDs and the WebView is gone
when the watch deadline is reached.

## 5. Verify policy, API, and device

- `packages/core` tests (Vitest) on this machine.
- `apps/tv` typecheck, lint, and Android assemble on a machine with an SDK.
- Same D6 hardware script as Kotlin Step 5. Same halt rule: no download /
  extract / YouTube-app fallback if the iframe cannot play.

**Exit:** Automated checks pass and the complete watch/rest cycle works on
the named TV, including restart and reboot recovery.
