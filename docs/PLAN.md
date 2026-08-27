# Nostalgia Box — Delivery Plan

Work breakdown for the v1.0 MVP. Derived from [PRD.md](PRD.md) and
[ARCHITECTURE.md](ARCHITECTURE.md); where the three disagree, the architecture
document wins on *how* and the PRD wins on *what*.

Every phase below ends in something demonstrable. You can stop after any of them and
show a working thing, which is the property that makes the ordering worth following.

---

## How to read this

- **`FR*` / `NFR`** references point at the PRD's numbered requirements.
- **`A1`–`A8`** point at the PRD amendments in [ARCHITECTURE.md §2](ARCHITECTURE.md).
  Several phases are blocked on an amendment being accepted or overruled.
- **Estimates** are rough dev-days for one developer already comfortable with Android
  and Media3. They are for sequencing, not for committing to a date.
- Exit criteria are written so they can be *checked*, not judged.

---

## Two tracks, not one

The app cannot be meaningfully tested past phase 2 without real hosted media. The
content pipeline is therefore a parallel track on the critical path, not a
prerequisite chore to be done "at some point".

```
CONTENT   C1 source ─► C2 transcode + manifest ─► C3 host ──────────┐
                                                                    │
APP       P0 scaffold ─┬─► P1 :core ──┐                             │
                       │              ├─► P3 downloads ◄────────────┘
                       └─► P2 data ───┘        │
                                               ▼
                                          P4 player ─► P5 overlays ─► P6 hardening ─► P7 stretch
```

**The single most common way this project stalls** is reaching phase 3 with nothing
to download. Start C1 on day one, in parallel with P0.

---

## Phase −1 · Decisions to confirm

Blocking. These are cheap to settle now and expensive to discover in phase 4.

| # | Decision | Recommendation | Blocks |
|---|---|---|---|
| D1 | Accept amendments A1–A8? | Accept all; A1 and A4 are not optional | P1, P3 |
| D2 | `minSdk` | 24, not the PRD's 21 (A8) | P0 |
| D3 | Per-channel size ceiling | ≤1.2 GB/channel, ~6 GB total (≈60–70 min at 720p) | C1 |
| D4 | Host | Object store with public read, HTTPS **and HTTP Range** (A4) | C3 |
| D5 | Schedules in MVP? | No — pure loop for all five; keep the field reserved | P1 |
| D6 | Target device for acceptance | Name one specific box; the switch-latency budget is meaningless without it | P4 |

D6 matters more than it looks. "Google TV" spans a 4× range of decode performance,
and NFR's sub-second channel switch is the one requirement that can fail on hardware
in a way that sends us back to a design decision.

---

# Content track

## C1 · Source and clear the content — 3–5 days

**Goal.** Five channels of legally reusable material, selected and downloaded, within
the D3 size ceiling.

- [ ] Pick sources per channel (Internet Archive, Prelinger, Library of Congress,
      public-domain film collections)
- [ ] Verify licence/public-domain status per item and record it — provenance goes in
      a CSV alongside the media, not in someone's memory
- [ ] Target ~60–70 min per channel (D3). Prefer several shorter items over one long
      one: more items means more tune-in variety and smaller re-download units
- [ ] Sanity-check for the Rabbit (Kids) channel specifically — this one gets watched
      unsupervised, so review every item end to end

**Exit.** Five folders of source media, each within the ceiling, each with a
provenance record.

**Note.** This is the least technical phase and the most likely to be underestimated.
Finding 70 minutes of *good* public-domain cartoons is genuinely slower than finding
70 minutes of public-domain cartoons.

---

## C2 · Transcode pipeline and manifest generator — 2 days

**Goal.** A repeatable script that turns a folder of source media into normalised MP4s
plus a valid `manifest.json`. The manifest is a build artifact; nobody hand-edits it.

- [ ] `tools/transcode.sh` — per [ARCHITECTURE.md §8](ARCHITECTURE.md):
      H.264 high / yuv420p / CRF 21, `-g 48 -keyint_min 48 -sc_threshold 0` at 24fps,
      AAC-LC 128k 48kHz stereo, `+faststart`
- [ ] **Uniform resolution and frame rate within each channel** — mixing them forces a
      decoder reconfiguration at every item boundary, which is a visible stutter
      exactly where we're pretending to be a continuous broadcast (A5)
- [ ] `tools/build-manifest.py` — walks the transcoded tree, reads `durationMs` from
      `ffprobe` and `sizeBytes` from `stat`, computes `sha256`, emits the schema in
      [ARCHITECTURE.md §5.1](ARCHITECTURE.md)
- [ ] Bump `version` on every regeneration
- [ ] Validate the output against the same parser `:core` uses, so a bad manifest
      fails on the operator's laptop rather than on the TV

**Exit.** `./tools/build-manifest.py out/` produces a manifest that `:core`'s validator
accepts, and every declared `durationMs` matches `ffprobe` to within 100ms.

**Gotcha.** The keyframe interval is not cosmetic — it sets the worst-case tune-in
error and is most of the channel-switch budget (A5). If the encode is wrong, phase 4
will look like a player bug.

---

## C3 · Host and verify — 1 day

**Goal.** Manifest and media reachable over HTTPS with working range requests.

- [ ] Upload to the chosen store (D4)
- [ ] **Verify Range support explicitly** before trusting it:
      ```
      curl -s -D- -o /dev/null -r 0-1023 https://host/ch1/toon-a.mp4 | head -1
      ```
      Must be `HTTP/1.1 206 Partial Content`. A `200` means resume is impossible and
      FR11 cannot pass on this host (A4)
- [ ] Confirm CORS is irrelevant here (native client, not a browser) but that the
      objects are genuinely public-read
- [ ] Record total footprint and compare against D3

**Exit.** `curl` returns 206 for a ranged request against every channel's first file,
and the manifest URL resolves over HTTPS.

**Local development host.** Note that Python's `http.server` does **not** implement
range requests, so it cannot be used to test resume. Use `nginx`, `caddy file-server`,
or `pip install rangehttpserver && python -m RangeHTTPServer` instead.

---

# App track

## P0 · Scaffold — 1–2 days

**Goal.** An installable app on the Google TV home row that shows a black screen.

- [ ] Gradle project, `settings.gradle.kts` with `:core` and `:app`
- [ ] `gradle/libs.versions.toml` version catalog — pin everything, no floating versions
- [ ] `:core` as a plain Kotlin JVM module with **no Android plugin applied**. This is
      the compiler-enforced boundary the whole test strategy rests on
- [ ] `:app` — `minSdk 24` (D2), `compileSdk`/`targetSdk` at current stable
- [ ] `AndroidManifest.xml`: `LEANBACK_LAUNCHER` category, 320×180 `android:banner`,
      `uses-feature android.software.leanback required="true"`,
      `android.hardware.touchscreen required="false"` (FR14)
- [ ] Empty full-screen `TvActivity`, landscape, no action bar, keep-screen-on
- [ ] CI: build both modules and run `:core` tests

**Exit.** APK installs on the target device (D6), appears in the Google TV apps row
with its banner, launches to black without crashing. **FR14 done.**

**Gotcha.** CI has no Android SDK by default and `dl.google.com` may be blocked in some
environments — set up the `:core` test job so it runs standalone, independent of
whether the Android job can run.

---

## P1 · `:core` — the broadcast clock — 3–4 days

**Goal.** All the hard logic, pure, deterministic, and covered. No Android anywhere in
this module.

**Blocked on:** D1 (A1, A3 change the model), D5.

- [ ] `model/` — `Slot`, `Lineup`, `IdealSlot`, `Channel`, `MediaFile`, `FileStatus`
- [ ] `manifest/` — DTOs, `kotlinx.serialization` with `ignoreUnknownKeys = true`,
      and `ManifestValidator`
- [ ] Validation rejects, with a named error: empty channel list, empty file list,
      zero or negative duration, duplicate channel `id`, duplicate `sha256` within a
      channel, missing required field. **A manifest that fails validation is rejected
      whole** — never half-applied
- [ ] `LineupBuilder` — cumulative `startMs` over **all declared files** (A1),
      `totalMs` from declared durations only (A3)
- [ ] `TuneInResolver.resolve(nowEpochMs)` — `floorMod`, binary search
- [ ] `AvailabilityProjector.project(ideal, availableIds)` — the skip step, kept
      strictly separate from `resolve`
- [ ] `ChannelSelector` — next/previous with wraparound (FR5), direct tune by number
- [ ] `ManifestDiffer` — additions and orphans by `sha256`, for the update flow

**Tests** — this is where the real bugs are, so test properties not examples:

- [ ] For any `now`, the resolved slot satisfies `startMs <= cycle < startMs + durationMs`
- [ ] Slots tile `[0, totalMs)` with no gap and no overlap
- [ ] `resolve(t) == resolve(t + totalMs)` for many random `t`
- [ ] Wraparound: last slot's end resolves to slot 0 offset 0
- [ ] Single-file lineup; `now` at exactly 0; negative `now`
- [ ] **Adding a file to the manifest changes the phase; marking a file unavailable
      does not.** This is A1 as an executable assertion — write it explicitly
- [ ] `ChannelSelector` wraps in both directions across 5 channels
- [ ] `ManifestDiffer` over pairs: unchanged, added, removed, replaced-at-same-URL

**Exit.** `./gradlew :core:test` green, with no Android SDK on the machine. Coverage of
the resolver and projector at 100% of branches — it's fifty lines, there's no excuse.

---

## P2 · Data layer — 2–3 days

**Goal.** Manifest fetched, validated, persisted; survives restart and airplane mode.

**Blocked on:** P1 (validator), C3 for a real URL (a local range-capable host works).

- [ ] Room: `channels`, `files` per [ARCHITECTURE.md §5.2](ARCHITECTURE.md), with
      `status ∈ PENDING | DOWNLOADING | COMPLETE | UNPLAYABLE`
- [ ] DAOs exposing `Flow` for "which files are `COMPLETE`" — the player observes this
- [ ] DataStore (Preferences): manifest URL, last-watched channel id, last applied
      manifest version, last refresh timestamp
- [ ] `ManifestRepository` — OkHttp GET, hand to `:core` to parse and validate, write
      to Room in **one transaction**
- [ ] Manifest URL resolution order: DataStore override → `adb` intent extra →
      `BuildConfig` default
- [ ] Network security config: cleartext permitted in debug only, blocked in release.
      Validate the scheme on user-entered URLs
- [ ] **Offline boot (A8):** if the fetch fails and Room has a manifest, proceed
      silently. The app never blocks on the network after first provisioning
- [ ] Hilt set up — modules for database, OkHttp, DataStore, repositories

**Exit.** Cold-start with the network off, having previously fetched: channels load
from Room, no error dialog, no spinner. Cold-start with no local data and no network:
a clean "can't reach the channel guide" state, not a crash.

---

## P3 · Download engine — 4–5 days

**Goal.** All five channels download, resume after a kill, and verify.

**Blocked on:** P2, C3 (needs a real host — this is the phase where the two tracks meet).

- [ ] `ChannelSyncWorker` — one per channel, unique-named, `NetworkType.CONNECTED`
      constraint, promoted to foreground for its duration
- [ ] Foreground plumbing: `POST_NOTIFICATIONS` on API 33+, `foregroundServiceType="dataSync"`
      and `FOREGROUND_SERVICE_DATA_SYNC` on API 34+
- [ ] `RangedDownloader` per [ARCHITECTURE.md §5.5](ARCHITECTURE.md):
      - [ ] download to `<sha256>.mp4.part`
      - [ ] resume with `Range: bytes=<len>-` when a partial exists
      - [ ] **expect 206; treat 200 as "host ignored Range" → truncate and restart**
      - [ ] throttle `bytesDownloaded` writes to ~1/sec, not per chunk
      - [ ] hash on completion; mismatch → delete, retry, cap at 3 (FR13)
      - [ ] atomic rename `.part` → target, mark `COMPLETE`
- [ ] Content-addressed storage: `<externalFilesDir>/channels/<channelId>/<sha256>.mp4`
- [ ] Free-space check before enqueueing: `StatFs` free vs `sum(sizeBytes) * 1.1`,
      surface the low-space warning (NFR, needs A2)
- [ ] Concurrency capped at 2 channels — a modest box shouldn't thrash flash and Wi-Fi
      while also trying to decode video
- [ ] Update flow (FR10, §10.3): compare `version`, diff by hash, transaction, enqueue
      additions, **delete orphans only after replacements are `COMPLETE`** so a failed
      update never leaves a channel emptier than it started

**Tests**

- [ ] MockWebServer: clean 206 path; 200-ignoring-Range path; mid-stream truncation;
      hash mismatch; 404 on one file of many
- [ ] `ManifestDiffer` integration over a real version bump

**Exit.** Kill the app mid-download and relaunch: it resumes from where it stopped, not
from zero. **Satisfies the PRD's "interrupted downloads resume" acceptance criterion.**
Airplane-mode mid-download and restore: it retries and completes.

---

## P4 · Player — 4–6 days

**Goal.** The product, essentially. Channels play at their wall-clock offset and flip
with the D-pad.

**Blocked on:** P1, P3 (or hand-sideloaded files to unblock early), D6.

**This is the risk concentration.** Everything before it is verifiable on a laptop;
this phase can fail on hardware in a way that sends us back to a design decision.

- [ ] `TvPlayerController` — owns `ExoPlayer`, created in `onStart`, released in
      `onStop`. TV boxes have few hardware decoder instances; holding one while
      backgrounded is antisocial. Safe to release because there is no position to
      preserve — re-attaching is a fresh `resolve(now)`
- [ ] Load a channel as a full playlist with `REPEAT_MODE_ALL` — looping (FR3) is then
      free and transitions are ExoPlayer's problem, not ours
- [ ] Tune-in: `setMediaItems(items, ideal.index, ideal.offsetMs)` + `prepare()` (FR1, FR2, FR6)
- [ ] `setSeekParameters(SeekParameters.CLOSEST_SYNC)` — we're joining mid-program;
      landing 1.4s off is imperceptible and is most of the switch budget
- [ ] Availability projection wired to the Room `Flow`; new files applied via
      `replaceMediaItems` **at item boundaries**, so playback isn't interrupted (§10.3)
- [ ] **Control lockdown, both directions** (FR8, FR9):
      - [ ] `PlayerView` gets a `ForwardingPlayer` with `COMMAND_SEEK_*`,
            `COMMAND_PLAY_PAUSE`, `COMMAND_SET_SPEED_AND_PITCH` removed and
            `setPlayWhenReady` no-op'd
      - [ ] the controller keeps the **raw** player — it must seek freely to tune in
      - [ ] `useController = false`, `setControllerAutoShow(false)`
      - [ ] **no MediaSession** (A6) — publishing one hands pause back to the system
            transport, the remote's media keys, and Assistant
- [ ] Audio focus handled manually: duck to volume 0 on transient loss, **never pause**
- [ ] Key handling in `dispatchKeyEvent`:
      | Key | Action |
      |---|---|
      | `DPAD_UP` / `CHANNEL_UP` | previous channel, wrapping (FR5) |
      | `DPAD_DOWN` / `CHANNEL_DOWN` | next channel, wrapping (FR5) |
      | `0`–`9` | direct tune, 1s digit window |
      | `MEDIA_PLAY_PAUSE` / `PLAY` / `PAUSE` | toggle mute (FR8) |
      | `MEDIA_FF` / `REW` / `NEXT` / `PREVIOUS` | consumed, no effect (FR9) |
      | `DPAD_CENTER` long-press 2s | hidden settings (FR12) |
- [ ] **Debounce channel selection ~350ms** before loading. Users hold the D-pad down;
      loading each intermediate channel is wasted work that makes the settled channel
      slower to appear
- [ ] Drift correction: re-derive on `onMediaItemTransition`, a 30s ticker, `onStart`,
      and `ACTION_TIME_CHANGED` / `ACTION_TIMEZONE_CHANGED`. Correct only past a
      **2-second dead zone** — correcting small drift is a visible micro-seek every
      30 seconds, which is worse than the drift
- [ ] Persist last-watched channel to DataStore on change (FR1)

**Measurement**

- [ ] Instrument key-event → `onRenderedFirstFrame` and log it. **If the p90 exceeds
      1s on the D6 device**, escalate in this order: confirm the debounce is working →
      confirm `CLOSEST_SYNC` is set → confirm the encode's GOP (C2) → only then
      consider the preloading fallback the `ChannelPlayer` interface exists for

**Exit.** FR1, FR2, FR3, FR5, FR6, FR8, FR9 all demonstrable on the target device.
Switch away from a channel, wait a minute, switch back: it has moved on, it did not
resume. Press play/pause: it mutes, the picture keeps moving.

---

## P5 · Overlays and settings — 2–3 days

**Goal.** The app explains itself without ever showing a menu.

**Blocked on:** P4.

- [ ] `ComposeView` overlay above the XML `PlayerView`. Keeping the video surface out
      of Compose sidesteps the surface/composition pitfalls and costs nothing
- [ ] **Channel bug** (FR7): `CH 03 · Rabbit`, ~3s, fade out, lower-left, inside the
      TV safe area, drop-shadowed so it survives light content. Updates **instantly**
      on every keypress even though the player is debounced
- [ ] **Setup progress** (§10.1): per-channel bars. Dismisses itself the moment
      channel 01 is playable; the rest continues behind the picture
- [ ] **No-signal slate**: build it properly — it is simultaneously the error state,
      the empty state during provisioning, and the foundation for the static-transition
      stretch goal
- [ ] **Hidden settings** (FR12), long-press OK: manifest URL entry, "Update channels",
      per-channel storage footprint (§5.3), and the local log tail
- [ ] Ring-buffer log to `filesDir`, surfaced in settings. There is no analytics in
      this product, so when a remote operator's channel 3 is black this is the only
      debugging tool that exists
- [ ] D-pad focus handling throughout — no touch assumptions anywhere (NFR)

**Exit.** FR7, FR11, FR12 demonstrable. First run shows progress and starts playing
channel 01 before the other four have finished.

---

## P6 · Hardening and acceptance — 3–4 days

**Goal.** Walk the PRD's acceptance checklist and pass every line.

**Blocked on:** P5.

- [ ] Corrupt-file handling: `onPlayerError` → mark `UNPLAYABLE` in Room → drop from
      the **projection, never from the timeline** → advance (NFR, A1)
- [ ] Whole-channel-unavailable → no-signal slate, and **stay there**. Auto-advancing
      would be the app making a choice, which is the one thing this product doesn't do
- [ ] Deliberate corruption test: truncate a downloaded file with `dd`, confirm the app
      skips it, logs it, and keeps playing
- [ ] Offline pass: disconnect the network entirely and run through every flow
- [ ] Update pass: bump the manifest version, add and remove a file, confirm playback
      continues throughout and orphans are cleaned up after
- [ ] Low-space pass: fill the device and confirm the warning fires before downloading
- [ ] Optional daily background refresh (`PeriodicWorkRequest`, unmetered constraint)
- [ ] Soak test: leave it running 24h+ and check for drift accumulation, memory growth,
      and decoder leaks across channel changes
- [ ] Walk the PRD §11 checklist line by line and record the result of each

**Exit.** Every box in [PRD §11](PRD.md) ticked, on the D6 device.

---

## P7 · Stretch — unscheduled

Only after P6 passes. Ordered by value-to-effort.

- [ ] **Static-noise transition on channel change.** Highest value for the effort — it
      is the single change that most sells the illusion, and P5's slate is already the
      surface it renders on
- [ ] **Auto-launch on boot** (FR15). Attempt it, but expect it to be blocked on retail
      Google TV by background activity-start restrictions (A7). Time-box it
- [ ] **CRT shader** via Media3 Effects — scanlines, vignette, chromatic aberration.
      Watch the GPU budget on low-end boxes; make it toggleable in settings
- [ ] **Per-channel schedules** (FR4). **Not a flag** — it breaks the constant-divisor
      model P1 is built on and needs its own resolver alongside `TuneInResolver`.
      Budget it as a real chunk of work, not an afternoon
- [ ] Cache eviction / size caps
- [ ] On-screen-keyboard onboarding for the manifest URL
- [ ] More than 5 channels; favourites and reordering

---

## Summary

| Phase | Days | Ends with |
|---|---|---|
| −1 Decisions | — | D1–D6 settled |
| C1 Source content | 3–5 | Five channels of cleared media |
| C2 Pipeline | 2 | Repeatable transcode + manifest generation |
| C3 Host | 1 | Verified 206 responses over HTTPS |
| P0 Scaffold | 1–2 | Installs, on the home row (FR14) |
| P1 `:core` | 3–4 | Clock tested, no SDK needed |
| P2 Data | 2–3 | Manifest persisted, boots offline |
| P3 Downloads | 4–5 | Resume after kill |
| P4 Player | 4–6 | The product works (FR1–FR9) |
| P5 Overlays | 2–3 | FR7, FR11, FR12 |
| P6 Hardening | 3–4 | PRD §11 fully ticked |

**App track ≈ 20–27 days. Content track ≈ 6–8 days, run in parallel.**
Critical path is the app track, provided C3 lands before P3 starts.

The two phases most likely to overrun are **C1** (finding *good* public-domain content
is slower than finding public-domain content) and **P4** (the only place hardware can
invalidate a design decision).
