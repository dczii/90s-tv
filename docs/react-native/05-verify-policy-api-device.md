# Step 5 — Verify policy, API, and device

**Parent:** [React Native Five-Step Plan](../REACT_NATIVE_PLAN.md) §5
**Status:** blocked on Steps 1–4. Adds no product surface.
**Produces:** a recorded checklist (automated + D6 hardware) that defines
**green** for Timed YouTube TV on the React Native track. A platform-blocker
note if the iframe cannot play on the named TV — and a halt, not a fallback.

---

## Goal

Prove the same product as
[`youtube-timer/05`](../youtube-timer/05-verify-policy-api-device.md): the
timer cannot be reset by restart or reboot, the PIN gates every policy path,
rest never autoplays, playback stays inside a WebView we destroy on expiry.
Record evidence per line. If the IFrame path is incompatible, **stop**.

Green criteria (`YT-D26`–`YT-D29`), the ten §11 lines, PIN matrix, and
hardware script **are not rewritten**. This file only changes *commands*
and *grep roots* for the RN tree.

---

## Exit criterion

Copied from the parent plan and sharpened:

- [ ] `npm test -w packages/core` green **in this environment** (timer, PIN,
      URL parser, `nextPlayable`, import-boundary, coverage on
      `timerEngine.ts`).
- [ ] On a machine **with** an Android SDK: app unit tests for sqlite
      restore, SecureStore token restore, OAuth poll state machine,
      `PlayerSession` generation; `npx expo run:android` (or Gradle
      assemble inside `apps/tv/android`) green. Typecheck + lint green.
- [ ] Hardware script in YouTube-timer 05 executed on the **named D6
      device**, every line recorded pass/fail with notes.
- [ ] Rest completion never constructs a player and always requires
      Continue watching (watched on device).
- [ ] PIN matrix from YouTube-timer 05: wizard not gated; Parent settings
      mutating paths gated; Continue watching not gated.
- [ ] If iframe playback is incompatible: a written platform blocker;
      **no** download/extract/YouTube-app/`react-native-webview` fallback
      in the tree.

This environment must not be described as having run the Android assemble
if it did not.

---

## Read first

- [REACT_NATIVE_PLAN.md](../REACT_NATIVE_PLAN.md) §5
- [youtube-timer/05](../youtube-timer/05-verify-policy-api-device.md) — **the
  hardware script, PIN matrix, origin triage, and halt rule are law**
- [01](01-stack-and-module-map.md)–[04](04-controlled-android-tv-playback.md)
- ARCHITECTURE environment note (RN-D10)

---

## Product / user-visible outcome

None. Hardware loops stay on the YT-D5 grid. Short loop **5 min watch /
5 min rest**. Do not relax core validation. Faster loops: debug-only
accelerated `TimeView` in `apps/tv`, never a second duration grid.
Hardware script items 8 and 9 (force-stop and reboot) run on **real 5/5**,
never accelerated (would invalidate YT-D13).

---

## Technical design

### What “green” means

The ten lines in YouTube-timer 05 / new PRD §11, with “WebView” meaning
`YoutubePlayerView`. Offline-after-provision is **not** a criterion.
Channel tune-in is **not** a criterion.

### Automated split (RN-D10)

| Where | What | Machine |
|---|---|---|
| `npm test -w packages/core` | TimerEngine, PinGate, YoutubeUrlParser, nextPlayable, boundary, coverage | **This** environment |
| `apps/tv` Jest/Vitest with mocks | sqlite `PersistedTimer` round-trip, bootCount mapping (`number \| null`, missing ≠ 0), SecureStore tokens, OAuth poll, PlayerSession stale generation, navigation host allowlist | SDK machine (or Node with sqlite) |
| `npx tsc -p apps/tv` + lint | Types + lint | Either, if no native imports at typecheck |
| `EXPO_TV=1 npx expo run:android` / assemble | APK | SDK machine |
| Optional Maestro / Detox | Not required if the hardware script is done on D6 | D6 |

Do not run emulator-only WebView tests and call hardware done.

### D6 device

**Chromecast with Google TV (4K)** unless another SKU is written here
before Step 4 hardware claims. Reason: WebView + IFrame codecs + D-pad +
device-code UI + RN focus engine.

### Hardware script

Execute YouTube-timer 05 items 1–11 **unchanged**. Translate only:

- `am force-stop` package is still `com.nostalgiabox.tv`.
- “no WebView” means dumpsys / no `YoutubePlayerView` / no YouTube audio.
- Focus visible at 3 m still applies; RN focus rings must meet the brief.

### PIN coverage matrix

Copy YouTube-timer 05’s table. Execute on device, not only in unit tests.

### Platform blocker

Same four origin-triage checks as YT-D28 (https asset origin, matching
`origin` playerVar, `com.google.android.webview` present, same id plays
in a browser on the device). Only a failure that survives all four is a
blocker.

Then **stop**. Do not add ExoPlayer, `expo-video`, `react-native-webview`,
`youtube-dl`, or `Linking.openURL` to YouTube.

Write `docs/react-native/PLATFORM_BLOCKER.md` with SKU, WebView version,
IFrame error, and a video.

### Grep gate

Search **only** `apps/tv`, `packages/core`, and lockfiles. Docs may name
rejected options.

```
vnd.youtube
ACTION_VIEW
googlevideo
yt-dlp
ExoPlayer
DownloadManager
react-native-webview
expo-av
expo-video
Linking.openURL
```

Hits need a written reason in code comments. `expo-video` / `expo-av` are
forbidden even though Expo lists them for TV — they are not an IFrame
host and would become a fallback player.

---

## Decisions already made

- YT-D26–D29 translated by RN-D10.
- Residual risks are not fail criteria.
- Old broadcast PRD §11 is not the bar.

---

## Decisions this step must lock

| ID | Decision | Lock |
|---|---|---|
| **RN-D24** | Commands | Core green = Vitest. App green = typecheck + lint + assemble on SDK host. |
| **RN-D25** | Grep | Include `react-native-webview` and `expo-video` as fallback-player tells. |

---

## Scope in / Scope out

**In:** Run and record. Hardware loop legal 5/5 (or debug accelerated
`TimeView`, except items 8–9). Platform-blocker doc if needed after origin
triage.

**Out:** Features, visual polish, new APIs, fallback players, fixing
Google’s iframe from our process.

---

## What this step retires or amends

| Item | Action |
|---|---|
| `./gradlew :core:test` as the host-green command | Replaced by `npm test -w packages/core` on this track |
| YouTube-timer 05 hardware script | Reused as-is |

---

## Non-negotiables

1. **Record each criterion.** “All passing” is not a result.
2. **Do not reinterpret a fail** as out of scope to get a tick.
3. **Do not invent assemble results** from this host.
4. **Do not add a fallback player** if the iframe fails.
5. **Rest autoplay is a ship blocker.**
6. **PIN matrix is a ship blocker.**

---

## Tests and verification

This step *is* tests. Deliverable: a checklist with the ten §11 lines, the
PIN table, the hardware script, the host that ran Vitest vs the host that
assembled, and either “iframe OK on D6” or a platform blocker.

---

## Implementation build order

1. `npm test -w packages/core` here; paste the summary.
2. On SDK host: app tests, lint, typecheck, assemble; install on D6.
3. Hardware script 1–11 in order (OAuth before manual-sign-out).
4. PIN matrix on device.
5. Grep gate.
6. Write results. If iframe dead, blocker doc and halt.

---

## Open risks

| Risk | Mitigation |
|---|---|
| This host is mistaken for an SDK host | RN-D10; report header names both machines |
| RN focus looks fine on emulator and fails on D6 | Hardware item 1 is not optional |
| Metro / Fast Refresh left a player alive | Hardware uses a release or at least a restarted process for items 8–9 |
| Debug skip-rest leaked to children | No child-path skip-rest. Short loop is legal 5/5 |
