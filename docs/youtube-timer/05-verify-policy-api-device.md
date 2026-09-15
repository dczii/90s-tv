# Step 5 — Verify policy, API, and device

**Parent:** [LittlePlay — Five-Step Plan](../YOUTUBE_TIMER_PLAN.md) §5
**Status:** blocked on Steps 1–4. Adds no product surface.
**Produces:** a recorded checklist (automated + D6 hardware) that
defines **green** for LittlePlay. A platform-blocker note if the
iframe cannot play on the named TV — and a halt, not a fallback.

---

## Goal

Prove the timer cannot be reset by restart or reboot, prove the PIN
gates every policy path, prove rest never autoplays, and prove playback
stays inside a WebView we destroy on expiry. Record evidence per line.
If the IFrame path is incompatible on the device, **stop**.

---

## Exit criterion

Copied from the parent plan and sharpened:

- [ ] `./gradlew :core:test` green **in this environment** (timer, PIN,
      URL parser, `nextPlayable`, `ModuleBoundaryTest`, Kover on
      `TimerEngine`).
- [ ] On a machine **with** an Android SDK: Android unit tests for
      DataStore restore, EncryptedSharedPreferences token restore, URL
      parser already covered in `:core`, OAuth poll state machine,
      `PlayerSession` generation; `./gradlew :app:lint` and
      `./gradlew :app:assembleDebug` green.
- [ ] Hardware script below executed on the **named D6 device**, every
      line recorded pass/fail with notes — not “all passing.”
- [ ] Rest completion never constructs a player and always requires
      Continue watching (watched on device, not inferred from code).
- [ ] PIN matrix below: wizard Connect/picker not gated; Parent
      settings mutating paths gated; Continue watching not gated.
- [ ] If iframe playback is incompatible: a written platform blocker;
      **no** download/extract/YouTube-app fallback in the tree.

This environment must not be described as having run `:app` tests.

---

## Read first

- [YOUTUBE_TIMER_PLAN.md](../YOUTUBE_TIMER_PLAN.md) §5
- [01](01-product-and-timer-rules.md) residual risks and new-PRD §11
  (Step 1 writes that checklist to match this file)
- [02](02-persistent-timer-and-parent-controls.md),
  [03](03-youtube-connection-and-curation.md),
  [04](04-controlled-android-tv-playback.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md) §13 environment note
- Old [PRD.md §11](../PRD.md) — **only to confirm it is not the bar**
- [phase-6-hardening.md](../prompts/phase-6-hardening.md) — tone: record
  each line; do not silently reinterpret a fail

---

## Product / user-visible outcome

No new screens. Hardware loops stay on the **YT-D5 grid**. The short
loop is **5 min watch / 5 min rest** (legal minima). Do **not** relax
`:core` validation for sub-minimum durations. If a faster loop is
needed, use a debug-only accelerated `TimeView` in `:app` (time
advances faster than wall), never a second duration grid. Hardware
script items 8 and 9 (force-stop and reboot) run on **real 5/5
wall/monotonic time**, never on an accelerated `TimeView` (that would
invalidate YT-D13). No child-path skip-rest.

---

## Technical design

### What “green” means (replaces old PRD §11)

Old §11 was: install, download 5 channels, autoplay mid-program, D-pad
channel flip, wall-clock tune-in, play/pause does not pause, offline
after provision, download resume. **All of that is retired.**

New §11 (also the Step 1 PRD rewrite):

1. App installs on Google TV and appears in the Apps row/tab with a
   Leanback launcher entry.
2. First run: parent sets PIN + 15/30 (or any legal pair) at Timer
   setup Save (`completeSetup` → `AwaitingConfirmation`); Connect and
   picker in the wizard are **not** PIN-gated; lands on confirmation
   with an allowlist (account **or** manual links); **no** player.
3. Continue watching starts playback of an allowlisted **video** id
   in-WebView (playlists expanded; `loadVideo` only) and starts the
   watch clock.
4. Pause, buffer, Home/background during `Playing` do not extend
   remaining (deadline check). Home pauses WebView audio; clock still
   runs.
5. At watch expiry the WebView is gone and rest UI is on screen.
6. At rest expiry confirmation is on screen and **no** WebView exists;
   Continue watching is required.
7. Process kill and device reboot during `Playing` and during `Resting`
   restore remaining (or confirmation if both elapsed); never a fresh
   unearned window; never autoplay after rest.
8. PIN required for duration change, reset, content, YouTube
   connect/disconnect **from Parent settings**; wizard Connect/picker
   not gated; Continue watching not PIN-gated.
9. Unplayable ids skipped on definitive probe negatives; `NoPlayableItem`
   if none; transport/401/quota keep last-known; no crash.
10. No YouTube media files in app storage; no `vnd.youtube` launches.

Offline-after-provision is **not** a criterion (playback needs
network). Channel tune-in is **not** a criterion.

### Automated split

| Where | What | Machine |
|---|---|---|
| `./gradlew :core:test` | TimerEngine expiry/recovery/YT-D12, PinGate lockout, YoutubeUrlParser, nextPlayable, ModuleBoundaryTest, Kover | **This** environment |
| `./gradlew :app:test` (or Robolectric) | DataStore `PersistedTimer` round-trip, bootCount recover mapping (`Int?`, missing ≠ 0), EncryptedSharedPreferences tokens, OAuth poll with MockWebServer, `PlayerSession` stale generation, `shouldOverrideUrlLoading` host allowlist | SDK machine |
| `./gradlew :app:lint :app:assembleDebug` | Lint + APK | SDK machine |
| `:app:connectedDebugAndroidTest` | Optional; not required if the hardware script is done on D6 | D6 or emulator with Google Play |

Do not run emulator-only WebView tests and call hardware done.
Do not claim `:app:assemble` ran here if it did not.

### D6 device

PLAN.md’s D6 still applies: **name one SKU.** Default:

**Chromecast with Google TV (4K)** (the common retail Google TV dongle).

If the team owns a Google TV Streamer (4K) or a specific TCL/Sony
Google TV instead, write that SKU here before Step 4 hardware claims
and use it consistently. “Google TV” is not a device. The old D6
reason was decode latency; the new reason is **WebView + IFrame
codecs + D-pad + device-code UI**.

### Hardware script

Record date, build SHA, SKU, and each line. Use debug short durations
(5 min watch / 5 min rest, legal grid) except items 8 and 9, which
must use real 5/5 wall/monotonic time.

1. **D-pad.** Walk Welcome → Timer setup → Connect or links → picker →
   confirmation → playback → (wait or debug expiry) rest → confirmation.
   Focus visible at 3 m. No touch required. Safe area: no primary action
   in the outer 5%.
2. **OAuth device-code.** Connect YouTube: URL + code readable;
   complete on a phone; app stores session; kill app; still signed in.
   Disconnect (PIN) clears session, keep allowlist.
3. **Manual links.** Sign out. Paste `youtu.be` and a playlist URL.
   Save. Continue watching plays.
4. **Rest does not autoplay.** On rest complete, wait 15s on
   confirmation. Screenshot/video: no WebView, no audio from YouTube.
   Continue watching then plays.
5. **Ads.** Play a known-monetized public video if possible. If an ad
   appears, remaining continues to drop. If no ad appears, record
   “no ad this sample” — not a fail. Fail only if we *stripped* ads
   or broke playback by blocking ad hosts.
6. **WebView codecs.** One standard H.264 YouTube video plays with
   picture and sound. If black/silent/error: **platform blocker**
   (after origin triage below).
7. **Expiry teardown.** At watch expiry: picture gone by the first
   frame after the tick that crosses the deadline (≤2s with the 1s
   ticker), rest UI, `dumpsys` / no lingering YouTube audio. Repeat
   with expiry during pause and during buffering (toggle on the iframe,
   or seek to a mid-roll if available).
8. **Process restart.** Real 5/5 wall/monotonic time — never an
   accelerated `TimeView` (that would invalidate YT-D13). `am force-stop`
   during `Playing` with time remaining; relaunch; remaining matches
   wall/monotonic recovery, **not a full watch window**; still
   `Playing`. Repeat during rest.
9. **Reboot.** Same: real 5/5, never accelerated `TimeView`. Mid-watch
   reboot; remaining from wall clock, not a full window. Mid-rest
   reboot; still resting or confirmation if rest elapsed. After
   rest-elapsed reboot: confirmation, **no** autoplay.
10. **Skip.** Allowlist includes a known embedding-disabled or removed
    id plus a good id; player skips to the good **video id**. IFrame
    `onError` `2` / `5` / `100` / `101` / `150` skip to the next video
    id (not `105`). A playlist allowlist entry advances to the next
    **video id** after skip/end (`loadVideo`, not `loadPlaylist`).
    Allowlist of only bad ids (definitive skip reasons):
    `NoPlayableItem`, Continue watching disabled or error, no crash.
11. **Home during play.** Home for 60s, return: remaining dropped by
    ~60s; not paused-as-credit; no YouTube audio while on Home.

### PIN coverage matrix

| Action | PIN required | Notes |
|---|---|---|
| First-run PIN create | No | Must match confirm field |
| First-run Connect / content picker | No | Wizard after Timer-setup Save; not re-prompted |
| Continue watching | No | Child path |
| Change watch/rest duration | Yes | YT-D12 on current phase |
| Reset current cycle | Yes | Lands on confirmation |
| Open Choose allowed content | Yes | After the first-run wizard; Parent settings path is gated |
| Save allowlist | Yes | Same gate as open (Parent settings) |
| Connect YouTube | Yes | After the first-run wizard; Parent settings path is gated |
| Disconnect YouTube | Yes | Allowlist remains |
| Wrong PIN ×5 | Lockout | After 5th failure lock 30s; then doubling, cap 15 min |
| Lockout wait | Blocks all gated actions | Continue watching still works if phase allows |
| Clear app data | N/A | Returns to Setup; residual risk, expected |

### Platform blocker

If step 6 of the hardware script fails (cannot play inside WebView),
**first prove it is not our page** before writing
`PLATFORM_BLOCKER.md`:

1. HTML is served from an https origin (`WebViewAssetLoader` /
   `https://appassets.androidplatform.net/`)
2. `origin` playerVar matches that base
3. `com.google.android.webview` is present; record the version
4. The same id plays in a plain browser on the same device

Only a failure that **survives all four** is a platform blocker.
IFrame never reaching `ready`, or an opaque origin, is **our config** —
fix in Step 4, not a blocker.

Then, if it still fails:

1. Write `docs/youtube-timer/PLATFORM_BLOCKER.md` (or a PR comment)
   with SKU, WebView version (`chrome://version` equivalent / package
   `com.google.android.webview`), IFrame error, and a video.
2. **Stop.** Do not add ExoPlayer, `youtube-dl`, Media3, or
   `Intent(ACTION_VIEW, youtubeUri)`.
3. Step 5 is **not green**. The product is blocked on the platform,
   not “almost done with a fallback.”

Grep gate before calling green — search **only** `app/src`, `core/src`,
and `gradle/libs.versions.toml`. Docs in this folder may name rejected
options:

```
vnd.youtube
ACTION_VIEW
googlevideo
yt-dlp
ExoPlayer
DownloadManager
```

Hits in those three trees need a written reason (code comments, not
“the step plan mentioned it”).

### Failure model (verification)

| Failure | Response |
|---|---|
| `:core:test` red here | Fix in Step 2/3; do not skip Kover |
| `:app:assemble` fails only for missing SDK **here** | Expected; run on SDK machine; do not mark that box from this host |
| Hardware autoplay-after-rest | Product bug; fail §11.6; do not ship |
| Hardware iframe incompatible | After origin triage (four checks above); only then platform blocker; halt |
| IFrame never reaches ready / opaque origin | Our config; fix in Step 4; not a platform blocker |
| PIN bypass via D-pad on a settings row | Product bug; fail matrix |
| Ads absent in sample | Not a fail |

---

## Decisions already made

- `:core` tests run here; `:app` needs an SDK elsewhere.
- No download/extract/YouTube-app fallback.
- Residual risks (official YouTube app, uninstall, data-clear, clock
  rollback) are **not** fail criteria.
- Old PRD §11 is not the bar.

---

## Decisions this step must lock

| ID | Decision | Lock |
|---|---|---|
| **YT-D26** | Automated split | `:core:test` on this host; lint/assemble/app unit tests on an SDK host. Never conflate. |
| **YT-D27** | D6 | Named SKU required. Default Chromecast with Google TV (4K). |
| **YT-D28** | Platform blocker | Origin triage first (https asset origin, matching playerVar, WebView present, same id in browser). Only a failure that survives all four is a blocker. Stop. No fallback player. Written evidence. |
| **YT-D29** | Green | The ten §11 lines above + PIN matrix + hardware script, each recorded. |

Rejected: emulator-only WebView as D6 evidence. Rejected: “ads must
play” as a pass condition. Rejected: shortening the reboot test out of
the script (that is the dual-clock bug).

---

## Scope in / Scope out

**In:** Run and record. Hardware loop is legal 5/5 (or debug accelerated
`TimeView`, except items 8 and 9 which must be real 5/5). Platform-blocker
doc if needed after origin triage. PRD §11 boxes ticked with evidence.

**Out:** Features, visual polish, new APIs, WorkManager, ExoPlayer,
fixing Google’s iframe from our process.

---

## What this step retires or amends

| Item | Action |
|---|---|
| Old PRD §11 | Replaced by YT-D29 (Step 1 already rewrote the doc; this step ticks it) |
| PLAN.md P6 soak/download/offline | Not applicable. Optional: 24h soak of the timer (memory, WebView leaks) — recommended, not a §11 box |
| “Green means five channels mid-program” | Retired |

---

## Non-negotiables

1. **Record each criterion.** “All passing” is not a result.
2. **Do not reinterpret a fail** as out of scope to get a tick.
3. **Do not run `:app` tests in this environment and invent results.**
4. **Do not add a fallback player** if the iframe fails.
5. **Rest autoplay is a ship blocker** even if timers persist.
6. **PIN matrix is a ship blocker** even if playback looks good.

---

## Tests and verification

This step *is* tests and verification. Deliverable: a checklist file or
PR body with the ten §11 lines, the PIN table, the hardware script, the
host that ran `:core:test` vs the host that ran `:app:assemble`, and
either “iframe OK on D6” or a platform blocker.

---

## Implementation build order

1. `./gradlew :core:test` here; paste the summary.
2. On SDK host: app unit tests, lint, assembleDebug; install on D6.
3. Hardware script uses legal 5/5 (or debug accelerated `TimeView` in
   `:app`, except items 8 and 9 which must be real 5/5). Do not relax
   `:core` minima.
4. Hardware script 1–11, in order (OAuth before manual-sign-out test).
5. PIN matrix on device, not only in unit tests.
6. Grep gate for fallback players.
7. Write results. If iframe dead, blocker doc and halt.

---

## Open risks

| Risk | Mitigation |
|---|---|
| This host is mistaken for an SDK host | YT-D26; ARCHITECTURE §13 copied into the report header |
| Debug skip-rest leaked to children | No child-path skip-rest. Short loop is legal 5/5; faster loops are debug `TimeView` in `:app` only |
| D6 unnamed until the last day | Default SKU above; Step 1 already says name it before Step 4 claims |
| YouTube serves no ads to the test account | Do not fail; record |
| Force-stop vs reboot confused in notes | Separate rows; reboot is the wall-clock path |
