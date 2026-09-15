# LittlePlay — Product Requirements Document (PRD)

**Product:** LittlePlay
**Platform:** Google TV (Android TV OS)
**Version:** 1.0 (MVP)
**Last updated:** 2026-09-14

This document is the product spec. How the app is built is
[`ARCHITECTURE.md`](ARCHITECTURE.md). Delivery steps live in
[`REACT_NATIVE_PLAN.md`](REACT_NATIVE_PLAN.md). Timer phases, confirmation,
ranges, and the enforcement paragraph are law in
[`youtube-timer/01-product-and-timer-rules.md`](youtube-timer/01-product-and-timer-rules.md)
(`YT-D1`–`YT-D7`). If this file drifts, that file wins.

The original broadcast/download PRD (LittlePlay, FR1–FR15, old §11) is
retired. [`PLAN.md`](PLAN.md) and [`prompts/`](prompts/) are historical.

---

## 1. Overview

LittlePlay is a parent-configured YouTube timer for Android TV. A parent
sets a PIN, watch and rest durations, and an allowlist of YouTube videos or
playlists. A child watches that curated YouTube **inside this app** for a
bounded window, then sits on a rest screen until an explicit **Continue
watching** press.

The player is an official YouTube IFrame inside a WebView this app destroys
when the watch window ends. There is no downloaded YouTube cache, no channel
flip, and no “already playing mid-program” illusion.

This app limits watching only while you use it. It cannot block the YouTube
app, and it cannot stop someone from uninstalling this app, clearing its
data, or changing the TV clock.

---

## 2. Goals & Non-Goals

### Goals (MVP)

- Bound a watch window and a rest window with parent-set durations.
- Require **Continue watching** before every new watch window, including the
  first launch after setup.
- Persist deadlines across process death and TV reboot so closing the app
  cannot reset either timer.
- Play only parent-allowlisted YouTube video IDs, in-process, via the IFrame
  Player API.
- Gate duration changes, cycle reset, content, and YouTube account actions
  behind a parent PIN after the first-run wizard.

### Non-Goals (MVP)

- No device-wide YouTube blocking, app pinning, or uninstall protection.
- No download, extract, or local cache of YouTube media.
- No launching the official YouTube app (`vnd.youtube` / `ACTION_VIEW`).
- No accounts, cloud sync, or profiles beyond one on-device parent PIN and
  one optional Google session for `youtube.readonly`.
- No pause/rewind DVR of the watch clock. Pause is a player control inside
  `Playing`; elapsed watch time still advances.
- No phone app, no Apple TV, no companion device.
- CRT shaders, ads stripping, and “make the iframe ad-free” are out.

---

## 3. Target User

**Parent + child on one Android TV.** The parent sets policy. The child uses
Continue watching, the YouTube iframe controls, and nothing that changes
policy. This replaces the technical operator who hosted a manifest URL.

---

## 4. Key Concepts

- **Phase:** One of `Setup`, `AwaitingConfirmation`, `Playing`, `Resting`.
  There is no `Paused` phase. Pause is a player state inside `Playing`.
- **Watch window:** The interval that starts on **Continue watching** and
  ends at the watch deadline. Remaining time is not credited back for pause,
  buffer, or backgrounding.
- **Rest window:** Starts at the watch-expiry instant (even if the process
  is dead then). Ends at rest deadline. The player must not exist.
- **Continue watching:** The only command that opens a **new** watch window.
  Restoring into a still-valid `Playing` may rebuild the player; that is not
  a new window.
- **Allowlist:** Parent-selected YouTube video and playlist IDs. Playlists
  expand to video IDs; the player loads videos only.
- **PIN verifier:** A salted hash stored on device. The PIN itself is never
  stored. First-run wizard Connect/picker is not PIN-gated; Parent settings
  mutations are.

---

## 5. Timer policy

Copied from YouTube-timer 01. Do not fork.

### 5.1 Phase machine (`YT-D1`)

```
Setup --completeSetup--> AwaitingConfirmation
AwaitingConfirmation --confirmWatching--> Playing
Playing --watch deadline--> Resting
Resting --rest deadline--> AwaitingConfirmation
Playing|Resting|AwaitingConfirmation --resetCycle--> AwaitingConfirmation
Playing --recovered past watch+rest--> AwaitingConfirmation
```

All other transitions are illegal (`IllegalTransition`). `completeSetup` is
the only path out of `Setup`. Commands never autoplay. `tick` is the only
path that expires a phase.

`Setup` ends when a PIN verifier and a timer policy are stored. The
allowlist may still be empty: Continue watching is disabled until at least
one entry exists. That is UI gating, not a fifth phase.

### 5.2 When the watch clock starts (`YT-D2`)

The watch clock starts in `confirmWatching`, at that moment. It does **not**
start on app launch, on leaving Setup, on rest expiry, or on composing the
confirmation screen.

`remainingMs` is `0` in `Setup` and `AwaitingConfirmation`. In `Playing` it
is time until the watch deadline; in `Resting`, until the rest deadline.

Confirmation copy (“15 minutes available”) is always the configured watch
duration — a fresh window — not leftover time from a killed session.
Leftover time exists only if we restore into `Playing` (process death
mid-watch).

### 5.3 Rest anchoring (`YT-D3`)

Rest starts at the **watch-expiry instant**, even if the process is dead
when that instant passes.

On recover / `tick`:

1. If `phase == Playing` and `now` is past the watch deadline, rest deadline
   = watch deadline + rest duration. Do not use restore-`now` as the rest
   start.
2. If that rest deadline is also already past, go to `AwaitingConfirmation`.
   Do not skip confirmation. Do not open a player.
3. If `phase == Resting` and `now` is past the rest deadline, go to
   `AwaitingConfirmation` with no player.

### 5.4 Confirmation (`YT-D4`)

Required after every rest, including the first launch after setup. Required
after a recovery that skipped a fully elapsed rest. Never skipped because
the allowlist is “ready,” because the app just updated, or because the
previous session ended cleanly.

### 5.5 Defaults and ranges (`YT-D5`)

| | Default | Min | Max | Step |
|---|---|---|---|---|
| Watch | 15 min | 5 min | 60 min | 5 min |
| Rest | 30 min | 5 min | 180 min | 5 min |

Values are stored as milliseconds. Policy validation rejects anything off
the step grid. No rule that rest must exceed watch.

### 5.6 Screens (when they appear)

| Brief screen | When it appears |
|---|---|
| Welcome / Parent setup | First launch; `Setup` |
| Timer setup | First launch; durations + PIN create |
| Connect YouTube | First-run wizard (not PIN-gated) or Parent settings (PIN-gated) |
| Choose allowed content | First-run wizard (not PIN-gated) or Parent settings (PIN-gated) |
| Ready / Continue watching | `AwaitingConfirmation` |
| Playback | `Playing` only |
| Rest timer | `Resting` — player absent |
| Parent settings | PIN-gated; available from rest and from confirmation as a secondary action |

Visual direction: near-black navy, warm off-white, coral primary, amber only
for time warnings. D-pad, 1920×1080, 5% safe area.

---

## 6. Enforcement limits

### 6.1 Parent-facing copy (`YT-D7`) — verbatim

Welcome shows this as the small note. Parent settings shows it again under
the policy summary. Do not soften it.

> This app limits watching only while you use it. It cannot block the
> YouTube app, and it cannot stop someone from uninstalling this app,
> clearing its data, or changing the TV clock.

### 6.2 Residual risks (product, not bugs)

| Risk | Honest status |
|---|---|
| Child opens the official YouTube app | Out of process. Not solvable here. |
| Uninstall / disable this app | Out of process. |
| Clear app data | Wipes PIN, policy, deadlines, allowlist, tokens. Next launch is Setup. |
| Wall-clock rollback after a reboot | Accepted. In-boot expiry does not use wall clock. |
| Offline cracking of a 4-digit PIN verifier | Accepted. Threat model is the child with the remote, not `adb pull`. |

### 6.3 Playback constraints

- IFrame Player API in a WebView this process owns. `loadVideo` only.
- Never download or extract YouTube streams.
- Never launch the official YouTube app.
- Unplayable IDs (embedding-disabled, removed, private, and the documented
  IFrame errors) are skipped. If none remain, show an error; do not crash.

---

## 7. Functional Requirements

Numbered FRs are the ten green lines in YouTube-timer 05 (`YT-D29`). Old
FR1–FR15 (tune-in, five channels, download, play/pause-does-not-pause) are
gone.

- **FR1:** The app installs on Google TV and appears in the Apps row/tab
  with a Leanback launcher entry, a 320×180 banner, landscape, and
  keep-screen-on. Touchscreen is not required.
- **FR2:** First run: parent sets PIN and a legal watch/rest pair at Timer
  setup Save (`completeSetup` → `AwaitingConfirmation`). Connect and picker
  in the wizard are **not** PIN-gated. The flow lands on confirmation with
  an allowlist (account **or** manual links) and **no** player.
- **FR3:** Continue watching starts playback of an allowlisted **video** id
  in-WebView (playlists expanded; `loadVideo` only) and starts the watch
  clock.
- **FR4:** Pause, buffer, and Home/background during `Playing` do not
  extend remaining. Home pauses WebView audio; the clock still runs.
- **FR5:** At watch expiry the WebView is gone and rest UI is on screen.
- **FR6:** At rest expiry confirmation is on screen and **no** WebView
  exists; Continue watching is required.
- **FR7:** Process kill and device reboot during `Playing` and during
  `Resting` restore remaining (or confirmation if both elapsed); never a
  fresh unearned window; never autoplay after rest.
- **FR8:** PIN required for duration change, reset, content, and YouTube
  connect/disconnect **from Parent settings**. Wizard Connect/picker is not
  gated. Continue watching is not PIN-gated.
- **FR9:** Unplayable ids are skipped on definitive probe negatives;
  `NoPlayableItem` if none; transport/401/quota keep last-known; no crash.
- **FR10:** No YouTube media files in app storage; no `vnd.youtube`
  launches.

---

## 8. Non-Functional Requirements

- **Navigation:** D-pad only. No touch-only hit targets. Focus readable
  from three metres. Primary actions inside a 5% TV safe area.
- **Compatibility:** Android TV / Google TV, `minSdk 24`. Phone and Apple
  TV are out of v1.
- **Identity:** `applicationId` `com.littleplay.tv`. Display name Timed
  YouTube TV.
- **Clock:** Elapsed watch time uses a monotonic clock while the boot is
  unchanged. Reboot recovery may use wall clock. Clock rollback after
  reboot is a residual risk, not a fail.
- **Privacy:** No analytics. OAuth scope is `youtube.readonly` only.
- **Network:** Playback needs network. Offline-after-provision is **not**
  a requirement (that belonged to the downloaded-media product).

---

## 9. Technical Approach (reference, not binding)

Binding architecture is [`ARCHITECTURE.md`](ARCHITECTURE.md). This track
builds an Expo TV app (`react-native-tvos`) with a Node-testable TypeScript
domain package. The player is a custom native WebView with
`WebViewAssetLoader`, not stock `react-native-webview`.

Retired from the old PRD: ExoPlayer/Media3, WorkManager media downloads, a
hosted manifest of video files, five themed channels, and wall-clock
tune-in.

---

## 10. User Flows

### 10.1 First run

1. Welcome → Timer setup (defaults 15/30, PIN create + confirm).
2. Save → `completeSetup`. Phase is `AwaitingConfirmation`. No player.
3. Connect YouTube **or** “Use links instead” (not PIN-gated).
4. Choose allowed content → Ready. Continue watching stays disabled until
   the allowlist is non-empty.
5. Continue watching → `Playing`.

### 10.2 Everyday

1. Launch → recover phase.
2. If `Playing`, rebuild player with remaining time.
3. If `Resting`, rest UI, no player.
4. If `AwaitingConfirmation`, confirmation, no player.
5. Never Setup unless data was cleared.

### 10.3 Watch expiry

`tick` → `Resting` → destroy player → rest countdown. Rest expiry →
`AwaitingConfirmation` → still no player.

### 10.4 Parent settings

From rest or confirmation, as a secondary action. PIN gate, then policy
summary, duration steppers, content, YouTube connect/disconnect, reset
cycle.

---

## 11. Acceptance Criteria (MVP “done”)

Replaces the old eight boxes (install, download 5 channels, autoplay
mid-program, D-pad flip, wall-clock tune-in, play/pause, offline,
download resume). Green is YouTube-timer 05 / `YT-D29`. Record each line;
do not write “all passing.”

1. App installs on Google TV and appears in the Apps row/tab with a
   Leanback launcher entry.
2. First run: parent sets PIN + 15/30 (or any legal pair) at Timer setup
   Save (`completeSetup` → `AwaitingConfirmation`); Connect and picker in
   the wizard are **not** PIN-gated; lands on confirmation with an
   allowlist (account **or** manual links); **no** player.
3. Continue watching starts playback of an allowlisted **video** id
   in-WebView (playlists expanded; `loadVideo` only) and starts the watch
   clock.
4. Pause, buffer, Home/background during `Playing` do not extend remaining
   (deadline check). Home pauses WebView audio; clock still runs.
5. At watch expiry the WebView is gone and rest UI is on screen.
6. At rest expiry confirmation is on screen and **no** WebView exists;
   Continue watching is required.
7. Process kill and device reboot during `Playing` and during `Resting`
   restore remaining (or confirmation if both elapsed); never a fresh
   unearned window; never autoplay after rest.
8. PIN required for duration change, reset, content, YouTube
   connect/disconnect **from Parent settings**; wizard Connect/picker not
   gated; Continue watching not PIN-gated.
9. Unplayable ids skipped on definitive probe negatives; `NoPlayableItem`
   if none; transport/401/quota keep last-known; no crash.
10. No YouTube media files in app storage; no `vnd.youtube` launches.

Offline-after-provision is **not** a criterion. Channel tune-in is **not**
a criterion. If the iframe cannot play on the named TV after origin
triage, stop — no download/extract/YouTube-app fallback.

Hardware loops use the legal grid. The short loop is **5 min watch /
5 min rest**. Do not invent a sub-minimum duration.

---

## 12. Stretch / Post-MVP

- Additional parent accounts or per-child profiles.
- Device-wide restrictions (separate product; not this process).
- Apple TV / phone companion.
- 24h soak of the timer (memory, WebView leaks) — recommended, not a §11
  box.

---

## 13. Open Questions

Lifecycle, session start, rest anchoring, defaults, and enforcement copy
are closed (`YT-D1`–`YT-D7`). Remaining:

- Google Cloud OAuth client ID / API key for device-code + Data API
  (Step 3). Not a product mystery.
- Confirm D6 SKU if the default Chromecast with Google TV (4K) is not the
  device on the desk. Name it before Step 4 hardware claims.
