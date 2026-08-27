# Nostalgia Box — Architecture

Companion to the PRD (v1.0 MVP). This document decides **how** we build what the PRD
describes, records the alternatives we rejected, and lists the places where the PRD
itself needs an amendment before implementation starts.

Status: proposed, not yet implemented. Nothing in this repo is built yet.

---

## 1. The one idea the whole app hangs on

> **Playback position is a pure function of the wall clock. It is never stored,
> never restored, and never advanced by us.**

Everything the PRD asks for falls out of this invariant:

| PRD requirement | How the invariant satisfies it |
|---|---|
| FR1 — launch mid-program | There is no "resume position" to load. Ask the clock. |
| FR2 — time-based tune-in | This *is* the tune-in function. |
| FR6 — recompute on switch | Switching channels is just asking the clock a different question. |
| FR8/FR9 — no pause, no seek | There is no state a user could move. The clock is not writable. |
| §11 — "switch away and back lands live" | Trivially true; there is nowhere else it could land. |
| Lifecycle (onStop, crash, audio focus, ANR) | Rendering may stop; the timeline cannot fall behind. Re-attach and re-ask. |

Anchoring the modulo at Unix epoch 0 (rather than at first launch, or at install
time) gives a free emergent property worth protecting: **two Nostalgia Boxes with
correct clocks are showing the same frame of the same channel.** Two TVs in one house
stay in sync with no coordination. This is a testable invariant, and §2.1 below
depends on preserving it.

---

## 2. Analysis: where the PRD needs amending

These are the gaps found while designing against the PRD. Each one is a decision the
implementation cannot avoid making, so it should be made deliberately.

### 2.1 The timeline must be built from the manifest, not from what has downloaded

The PRD contains a latent conflict:

- **FR2** computes position as `epochSeconds % channelTotalDurationSec`.
- **§5.2** says "a channel becomes playable as soon as at least one of its files is
  downloaded; the rest fill in."

If `channelTotalDurationSec` is the sum of *downloaded* files, then every completed
download changes the divisor, which re-phases the entire channel. The picture jumps
at random intervals during provisioning, and the cross-device sync property in §1 is
lost permanently (each box excludes a different set of files).

**Amendment.** The timeline is always computed over **every file declared in the
manifest**, downloaded or not. Availability is a separate, later projection:

```
resolve(now)  ->  IdealSlot(index, offsetMs)      // pure, manifest-derived, stable
project(ideal) ->  PlayableSlot                    // skips slots whose file is absent
```

A missing file is a hole we skip over, not a slot we delete. When the file finally
lands it simply starts appearing at its correct time. Corrupt and unplayable files
(NFR: "skips to the next file and logs") are handled by the same projection, for the
same reason.

### 2.2 `sizeBytes` is missing and is load-bearing

§8 requires "warn if free space is low before downloading" and §10.1 requires
per-channel setup progress. Neither is implementable from the current schema.
`Content-Length` is not a substitute — it is unavailable until each request is in
flight, which is exactly too late to warn.

**Amendment.** Add required `sizeBytes` to each file entry.

### 2.3 `durationSec` should be `durationMs`, and declared duration is law

Integer seconds introduces up to ±0.5s of error per file, which accumulates across a
channel and permanently offsets it from the true media. Separately, the PRD never
says what happens when the declared duration disagrees with the actual file.

**Amendment.** Use `durationMs`. The **declared** duration is authoritative for the
timeline — the actual file must never influence it, or the cross-device sync property
in §1 dies. Mismatches are logged for the operator, and the runtime absorbs them:
if the file ends early we advance immediately; if it runs long we let it finish and
correct at the next boundary (see §6.3).

### 2.4 The hosting choice is constrained by resume

FR11 and §5.2 require resumable downloads. That requires the host to honour HTTP
`Range` requests and return `206 Partial Content`. Most object stores do (S3, R2, B2,
GCS); several convenient-looking options do not (Google Drive share links, some
app-platform static handlers, a few CDN configurations).

**Amendment.** Add "must support HTTP Range requests" to §5.1 as a hosting
requirement. The downloader detects a `200` where it asked for `206` and restarts the
file rather than silently corrupting it, but a host without Range support fails the
FR11 acceptance criterion outright.

### 2.5 The encoding ladder is part of the architecture

Tune-in accuracy (FR2) and the <1s switch budget (§8) are both governed by keyframe
interval, which the PRD does not specify. Seeking to an arbitrary mid-file offset with
exact accuracy forces the decoder to run from the previous keyframe — with a 10-second
GOP that is a visible stall on every channel change.

**Amendment.** Add a transcode spec to §6 (see §8 below). Short version: 2-second
keyframe interval, fixed GOP, uniform resolution and frame rate *within* a channel so
item transitions don't reconfigure the decoder.

### 2.6 A MediaSession would re-open the door we just closed

FR8 says play/pause must not pause. If we publish a `MediaSession`, the system
transport controls, the Google TV remote's dedicated keys, and Assistant ("pause the
TV") all regain the ability to pause us — from outside our key handler.

**Decision.** Ship no `MediaSession` in MVP. We give up the "now playing" system card,
which is consistent with the product anyway. Audio focus is then handled manually
(§6.4).

### 2.7 FR15 (auto-launch on boot) is probably not achievable on retail Google TV

Background activity starts have been restricted since Android 10. A `BOOT_COMPLETED`
receiver calling `startActivity()` is blocked on current builds unless the app is a
system/privileged app. It may work on AOSP-based Android TV boxes; it will likely not
work on a retail Chromecast with Google TV.

**Recommendation.** Keep FR15 in stretch, and set the expectation that it is
device-dependent and best-effort. Do not let the MVP acceptance criteria depend on it.

### 2.8 Smaller items

- **minSdk.** The PRD says ~21. Recommend **24** — it covers essentially all active
  Android TV hardware, and avoids a long tail of Media3, `WorkManager` foreground, and
  storage-API workarounds that buy us nothing.
- **`sha256` should be required, not optional.** It is what makes content-addressed
  storage (§5.3) and update-diffing (§5.4) work. Optional integrity means optional
  correctness on update.
- **Offline boot is unspecified.** The app must never block on the network once
  provisioned. The last successfully parsed manifest is persisted and is what the app
  boots from; a refresh is always a background concern.
- **Channel identity.** `id` is the stable key across manifest versions; `number` is
  display only. Renumbering a channel must not re-download it.

---

## 3. Module structure

Two Gradle modules.

```
:core   pure Kotlin/JVM — no Android imports at all
        models · BroadcastClock · LineupBuilder · TuneInResolver
        · ChannelSelector · manifest DTOs + parsing + validation

:app    Android
        data/     Room · OkHttp · WorkManager · DataStore
        player/   Media3 ExoPlayer · control lockdown · drift correction
        ui/       single Activity · overlays · hidden settings
```

**Why split at all, for an app this size?** Three reasons, in order of weight:

1. All the genuinely hard logic — modulo arithmetic, slot resolution, wraparound,
   availability projection, update diffing — is pure and deterministic. Isolating it
   in a module that *cannot* import Android makes that a compiler-enforced property
   rather than a code-review convention.
2. It gets a plain JUnit test suite that runs in milliseconds with no emulator and no
   Android SDK. That matters immediately: this development environment has no Android
   SDK available and `dl.google.com` is blocked by network policy, so `:core` is the
   only part of the system that can be built and verified here.
3. The seam is where a future channel-guide screen, a second player implementation, or
   a scheduling engine would attach.

Anything beyond two modules is overhead at this size.

---

## 4. Domain core (`:core`)

### 4.1 Model

```kotlin
data class Slot(
    val index: Int,
    val fileId: String,       // sha256 — content address
    val startMs: Long,        // cumulative offset from channel origin
    val durationMs: Long,
)

data class Lineup(
    val channelId: Int,
    val slots: List<Slot>,
    val totalMs: Long,        // sum of DECLARED durations, all files
)

data class IdealSlot(val index: Int, val offsetMs: Long)
```

### 4.2 Tune-in

```kotlin
fun Lineup.resolve(nowEpochMs: Long): IdealSlot {
    val cycle = Math.floorMod(nowEpochMs, totalMs)   // floorMod, not %, for safety
    val i = slots.binarySearchBy(cycle) { it.startMs }.let { if (it < 0) -it - 2 else it }
    return IdealSlot(i, cycle - slots[i].startMs)
}
```

Binary search rather than a linear scan because the same function runs on every drift
tick, not just on channel change.

### 4.3 Invariants worth testing directly

- For any `now`, the returned slot satisfies `startMs <= cycle < startMs + durationMs`.
- Slots tile `[0, totalMs)` with no gap and no overlap.
- `resolve(t)` and `resolve(t + totalMs)` are equal.
- `resolve(t + slot.durationMs - offset)` is the start of the next slot (wraparound at
  the last slot).
- A lineup with one file, and a lineup where `now < 0`, both behave.
- Validation rejects: empty file list, zero or negative duration, duplicate `id`.

These are cheap property-style tests over a `FakeClock`, and they are where the real
bugs in this product will be.

---

## 5. Data layer (`:app/data`)

### 5.1 Manifest schema v1 (amended)

```json
{
  "version": 3,
  "updatedAt": "2026-08-26T00:00:00Z",
  "minAppVersion": 1,
  "channels": [
    {
      "id": 1,
      "number": "01",
      "name": "Cartoons",
      "sortOrder": 1,
      "files": [
        {
          "url": "https://cdn.example.com/ch1/toon-a.mp4",
          "sha256": "3f7a…",
          "durationMs": 640000,
          "sizeBytes": 214958080,
          "mimeType": "video/mp4"
        }
      ],
      "schedule": null
    }
  ]
}
```

Changes from the PRD example: `durationSec` → `durationMs`; `sha256` required;
`sizeBytes`, `mimeType`, `sortOrder`, `minAppVersion` added.

`schedule` stays in the schema and stays `null` for MVP — reserving the field now means
per-channel schedules (§12) land without a manifest version bump.

Parsing lives in `:core` with `kotlinx.serialization`, `ignoreUnknownKeys = true` so
future fields don't break old installs. A manifest that fails validation is **rejected
whole** — we never half-apply one, and the previous good manifest keeps serving.

### 5.2 Persistence

**Room** for channels, files, and download state. Not DataStore/JSON: the download
workers need transactional per-file status updates and the UI needs to observe "which
files are local" as a `Flow`. That is a database.

```
channels(id, number, name, sortOrder, manifestVersion)
files(sha256 PK, channelId, url, durationMs, sizeBytes, position,
      status, bytesDownloaded, localPath, lastError)

status ∈ PENDING | DOWNLOADING | COMPLETE | UNPLAYABLE
```

`UNPLAYABLE` is set by the *player* (§6.5), not the downloader — a file can verify
correctly and still fail to decode on a given device.

**DataStore (Preferences)** for settings: manifest URL, last-watched channel id, last
applied manifest version, last refresh timestamp.

### 5.3 Storage layout

```
<getExternalFilesDir>/channels/<channelId>/<sha256>.mp4
```

Content-addressed filenames. This costs nothing and removes a whole class of bug: a
file changed at the same URL is a different name, so there is no stale-cache case to
reason about, and update-diffing (§5.4) is a set difference over hashes.

### 5.4 Update flow (§10.3)

1. Fetch manifest; parse and validate; compare `version` — bail early if unchanged.
2. Diff by `sha256`: hashes to add, hashes now orphaned.
3. Write the new manifest to Room in one transaction. **The lineup changes here** —
   the channel re-phases, which is correct and expected on a content update.
4. Enqueue downloads for the additions.
5. Delete orphans only after their replacements are `COMPLETE`, so a failed update
   never leaves a channel emptier than it started.

Playback continues throughout; new items are applied to the player at the next item
boundary via `replaceMediaItems` rather than rebuilding the playlist mid-frame.

### 5.5 Download engine

**WorkManager, one `ChannelSyncWorker` per channel**, unique-named, network-constrained,
promoted to foreground for the duration.

Why per-channel rather than one worker for everything: a single worker downloading
~6 GB will exceed the execution window and is all-or-nothing on retry. Why not one
worker per *file*: five foreground notifications and no natural place to report
per-channel progress. Per-channel is the unit the setup screen (§10.1) actually
displays.

Per file:

```
1. target = <sha256>.mp4, partial = <sha256>.mp4.part
2. if partial exists  ->  Range: bytes=<len>-
3. expect 206. A 200 means the host ignored Range: truncate and restart.
4. stream to .part, updating bytesDownloaded on a throttle (~1/sec, not per chunk)
5. on completion, hash the file; mismatch -> delete, retry with backoff, cap at 3
6. rename .part -> target atomically; mark COMPLETE
```

Before enqueueing anything, compare `StatFs` free bytes against
`sum(sizeBytes) * 1.1` and surface the §8 low-space warning.

Retry is WorkManager's exponential backoff. Parallelism is capped at 2 concurrent
channels so a modest TV box isn't thrashing its flash and its Wi-Fi at once while
trying to also decode video.

> **API notes.** Foreground work needs `POST_NOTIFICATIONS` on API 33+, and
> `foregroundServiceType="dataSync"` plus `FOREGROUND_SERVICE_DATA_SYNC` on API 34+.

**Rejected: Media3 `DownloadManager`/`DownloadService`.** It gives resumable chunked
downloads, progress, and `Requirements` for free, and plays straight from its cache. We
declined it because the PRD wants real, inspectable `.mp4` files on disk with sha256
verification — which enables operator sideloading and makes debugging a bad channel a
file manager away rather than an opaque cache dump. If sideloading turns out not to
matter, this is the cheapest decision in the document to revisit.

---

## 6. Player layer (`:app/player`)

### 6.1 One player, debounced

A single `ExoPlayer`, reused across channel changes:

```kotlin
player.setMediaItems(lineup.toMediaItems(), idealSlot.index, idealSlot.offsetMs)
player.prepare()
```

The whole channel goes in as a playlist with `REPEAT_MODE_ALL`, so looping (FR3) is
free and item transitions are handled by ExoPlayer rather than by us.

**Debounce the selection by ~350ms.** Users hold the D-pad down and flip through five
channels in a second; loading each one is wasted work and makes the *settled* channel
slower to appear. The channel bug (FR7) updates instantly on every keypress — only the
player waits for the selection to settle. This is a bigger win than any preloading
scheme and costs one coroutine `debounce`.

**Rejected for MVP: dual-player / neighbour preloading.** Real, but earn it with a
measurement first. `ChannelPlayer` is an interface so a `PreloadMediaSource`-backed
implementation can drop in behind it if the debounced single player misses the <1s
budget on target hardware.

### 6.2 Seek accuracy is a deliberate trade

```kotlin
player.setSeekParameters(SeekParameters.CLOSEST_SYNC)
```

Exact seeking decodes from the previous keyframe to the target — with a 2-second GOP
that's up to 2s of decode work on every single channel change. We are tuning into a
program already in progress; nobody can tell that we joined 1.4 seconds off. Snapping
to the nearest keyframe is invisible to the user and is most of the <1s budget.

This is why §8's keyframe interval is an architectural requirement and not a
nice-to-have: it sets the worst-case tune-in error.

### 6.3 Drift correction

The clock and the player are two independent time sources and they will separate —
declared durations differ slightly from real ones, decoders stall, and NTP corrects the
system clock mid-program.

Re-derive and compare on: every `onMediaItemTransition`, a 30s ticker, `onStart`, and
`ACTION_TIME_CHANGED` / `ACTION_TIMEZONE_CHANGED`.

```
ideal = lineup.resolve(now)
if (ideal.index != currentIndex || abs(ideal.offsetMs - currentPositionMs) > 2000)
    player.seekTo(ideal.index, ideal.offsetMs)
```

The 2-second dead zone matters: correcting small drift produces a visible micro-seek
every 30 seconds, which is worse than the drift. `elapsedRealtime` is used to
distinguish ordinary drift from a wall-clock jump, so an NTP correction is treated as a
deliberate re-sync rather than as jitter.

### 6.4 Locking the controls (FR8, FR9)

Two layers, because the threat comes from two directions.

**Outward** — the `PlayerView` is handed a `ForwardingPlayer` that removes
`COMMAND_SEEK_*`, `COMMAND_PLAY_PAUSE`, and `COMMAND_SET_SPEED_AND_PITCH`, and no-ops
`setPlayWhenReady`. `useController = false`, `setControllerAutoShow(false)`.

**Inward** — the controller keeps a reference to the raw `ExoPlayer`, because *we* must
seek freely to tune in. The wrapper is a UI-facing restriction, not an internal one.
Keeping these two references distinct is the whole mechanism; conflating them either
breaks tune-in or leaks a seek control.

Key handling in the Activity's `dispatchKeyEvent`:

| Key | Action |
|---|---|
| `DPAD_UP` / `CHANNEL_UP` | previous channel, wrapping (FR5) |
| `DPAD_DOWN` / `CHANNEL_DOWN` | next channel, wrapping (FR5) |
| `0`–`9` | direct tune, 1s digit-collection window |
| `MEDIA_PLAY_PAUSE`, `MEDIA_PLAY`, `MEDIA_PAUSE` | toggle mute (FR8) |
| `MEDIA_FF`, `MEDIA_REW`, `MEDIA_NEXT`, `MEDIA_PREVIOUS` | consumed, no effect (FR9) |
| `DPAD_CENTER` long-press 2s | hidden settings (FR12) |
| `BACK` | dismiss overlay, else default |

Number keys aren't in the PRD; they're two dozen lines and they're what the remote in
the drawer of an actual 90s TV had.

### 6.5 Failure model

| Failure | Response |
|---|---|
| Ideal slot's file not downloaded yet | Skip to next available slot, play from 0, mark off-clock, re-sync at the next boundary where the ideal slot *is* available |
| Decode/source error on an item | Mark file `UNPLAYABLE` in Room, drop from the playable projection (never from the timeline), advance |
| Every file in a channel unavailable | "No signal" slate for that channel. Stay there — the user flips. Auto-advancing would be the app making a choice, which is the one thing this product doesn't do |
| Manifest fetch fails | Silent. Keep serving the persisted manifest. Surface in the settings screen only |
| Audio focus lost transiently | Duck to volume 0. **Never pause** — the picture must not freeze |
| Audio focus lost permanently | Another app has the screen; our Activity is stopping anyway |

The "no signal" slate is worth building properly: it is simultaneously the error state,
the empty state, and the foundation for the static-transition stretch goal (§12).

### 6.6 Lifecycle

The Activity owns the player: created in `onStart`, released in `onStop`. Android TV
devices have a small number of hardware decoder instances and holding one while
backgrounded is antisocial. The ViewModel owns only the selected channel id and the
lineup.

This is safe precisely because of §1 — there is no position to preserve across the
gap. Re-attaching is a fresh `resolve(now)`.

---

## 7. UI layer (`:app/ui`)

One full-screen Activity. `PlayerView` (`useController=false`) in XML, with a
`ComposeView` overlay above it for everything else. Keeping the video surface out of
Compose sidesteps the surface/composition pitfalls and costs nothing here — the
overlays are the only part with real UI, and they're better in Compose.

State machine:

```
Booting ──► Provisioning(perChannelProgress)
   │              │  channel 01 has ≥1 file
   │              ▼
   └───────► Tuned(channel, slot, offClock) ◄──► NoSignal(channel, reason)
                  │
                  └──► Settings   (hidden, long-press OK)
```

Overlays:

- **Channel bug** (FR7) — `CH 03 · Rabbit`, ~3s, fades out. Lower-left, safe-area
  inset, drop-shadowed for light content.
- **Setup progress** (§10.1) — per-channel bars. Dismisses itself the moment channel 01
  is playable; the rest continues behind the picture.
- **No signal** — see §6.5.
- **Settings** (FR12) — manifest URL, "Update channels", per-channel storage footprint
  (§5.3), and the local log tail.

Manifest entry: `BuildConfig` default, overridable in settings, and overridable via
`adb shell am start -n … --es manifest_url …`. That last one is thirty lines and turns
manifest iteration from an on-screen-keyboard chore into a shell command — worth it for
a technical operator.

Launcher (FR14): `LEANBACK_LAUNCHER` category, 320×180 `android:banner`,
`uses-feature android.software.leanback required="true"`,
`android.hardware.touchscreen required="false"`.

---

## 8. Content pipeline (operator-side)

Not app code, but the app's correctness depends on it.

```bash
ffmpeg -i in.mkv \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 21 \
  -vf "scale=-2:720,fps=24" \
  -g 48 -keyint_min 48 -sc_threshold 0 \
  -c:a aac -b:a 128k -ar 48000 -ac 2 \
  -movflags +faststart out.mp4
```

- `-g 48` at 24fps = a **2-second keyframe interval**, which bounds tune-in error
  (§6.2). `-sc_threshold 0` keeps the GOP fixed so the bound actually holds.
- **Uniform resolution and frame rate within a channel.** Mixing them forces a decoder
  reconfiguration at each item boundary — a visible stutter exactly where we're
  pretending to be a continuous broadcast.
- `durationMs` and `sizeBytes` come from `ffprobe` and `stat`, so manifest generation
  should be a script, not hand-editing. The manifest is a build artifact.

---

## 9. Cross-cutting

**DI** — Hilt. Room + WorkManager (`@HiltWorker`) + repositories is exactly its shape,
and hand-rolling `WorkerFactory` wiring costs more than the KSP round trip.

**Network** — OkHttp + `kotlinx.serialization` directly. Retrofit for a single GET is
a dependency without a job. Cleartext disabled in release; a network security config
permits it in debug only, so a LAN test host works during development without shipping
a hole. The manifest URL is user-supplied, so validate the scheme on entry.

**Observability** — no analytics (per §2 Non-Goals). Instead, a bounded ring-buffer log
to `filesDir`, surfaced in the settings screen. When a remote operator's channel 3 is
black, this is the only debugging tool that exists.

**Versions** — pinned in `gradle/libs.versions.toml`, latest stable at scaffold time.
Floors that matter: Media3 ≥ 1.4 (for `replaceMediaItems` and the preload manager if we
need §6.1's fallback), WorkManager ≥ 2.9, Room ≥ 2.6. `minSdk 24`, `compileSdk`/
`targetSdk` at current stable.

**Testing**

| Layer | Approach |
|---|---|
| `:core` clock/lineup | Plain JUnit + `FakeClock`, property-style (§4.3). Runs without an Android SDK |
| Download resume | MockWebServer: 206 path, 200-ignoring-Range path, mid-stream truncation, hash mismatch |
| Update diffing | JUnit over manifest pairs |
| Key mapping | Robolectric |
| Player | Manual on target hardware; instrument key-event → `onRenderedFirstFrame` for the <1s budget |

---

## 10. Build order

Each phase is independently demonstrable.

| # | Phase | Ends when |
|---|---|---|
| 0 | Scaffold — Gradle, two modules, version catalog, leanback manifest entry | App installs and shows a black screen on the TV home row |
| 1 | `:core` — models, clock, lineup, tune-in, manifest parse + validate, tests | Test suite green; no Android SDK needed to run it |
| 2 | Data — Room, DataStore, manifest fetch, offline persistence | Manifest fetched and stored; survives restart and airplane mode |
| 3 | Downloads — `ChannelSyncWorker`, Range resume, sha256, space check | Kill the app mid-download; it resumes (§11 acceptance) |
| 4 | Player — ExoPlayer, tune-in, lockdown, key handling, drift | FR1/2/3/5/6/8/9 demonstrable |
| 5 | Overlays — channel bug, setup progress, no-signal, settings | FR7/FR11/FR12 demonstrable |
| 6 | Hardening — corrupt-file skip, low-space warn, update flow, offline pass | Full §11 acceptance checklist |
| 7 | Stretch — CRT shader, static transition, schedules, boot launch | — |

Phases 1 and 2 are parallelizable against 0. Phase 4 is the risk concentration: the
<1s switch budget is the only requirement that can fail on hardware in a way that
sends us back to a design decision (§6.1's rejected dual-player).

---

## 11. Answers to the PRD's open questions

**Where will manifest + media be hosted?**
Any object store with public read, HTTPS, and **Range support** (§2.4). Cloudflare R2
or Backblaze B2 behind Cloudflare for the free egress; S3/GCS work identically. No auth
for MVP — a public bucket at an unguessable prefix. Signed URLs would expire mid-download
and would break the content-addressed cache; if auth is genuinely needed later, a
long-lived bearer token on the manifest fetch is the smaller change.

**Is the manifest URL fixed at build time or user-configurable?**
Both, cheaply: `BuildConfig` default, settings override, `adb` intent extra (§7).
There's no reason to choose.

**Do any channels need scheduling in MVP?**
No — pure loop for all five. The `schedule` field stays in the schema so FR4 lands
later without a manifest version bump. Note that scheduling breaks the constant-divisor
model in §1 and needs its own resolver; that's a real chunk of work, not a flag.

**Target download size per channel?**
Bounded by hardware, not by taste: a Chromecast with Google TV (HD) ships **8 GB total
with roughly 4–5 GB usable**. Recommend **≤ 1.2 GB per channel, ~6 GB ceiling across
all five**, which at 720p/H.264/CRF 21 (~2.5 Mbps) is about **60–70 minutes of content
per channel**. Longer loops need either a lower ladder or 4K-tier hardware. This should
go into §8 of the PRD as a hard constraint, since it also sets first-run download time
(~30–50 minutes on a typical home connection).

---

## 12. Known risks

| Risk | Mitigation |
|---|---|
| <1s channel switch missed on low-end hardware | Debounce first (§6.1), then `CLOSEST_SYNC` (§6.2), then the preloading fallback the `ChannelPlayer` interface exists for |
| Device boots with a wrong clock before NTP; channel starts at the wrong offset then jumps | `ACTION_TIME_CHANGED` receiver forces a clean re-sync (§6.3). Unavoidable in the first seconds; correct thereafter |
| 8 GB devices can't hold five channels | Size ceiling in §11, plus the pre-download space check (§5.5). Cache eviction stays out of scope but the footprint display makes the problem visible |
| Host doesn't honour Range; FR11 unachievable | Detected at first download; fails loudly rather than corrupting. Hosting requirement in §2.4 |
| FR15 boot launch blocked by platform | Stay in stretch, expectation set (§2.7) |
| Declared/actual duration drift accumulates | Declared duration is authoritative; runtime absorbs the difference (§2.3, §6.3); pipeline emits durations from `ffprobe` (§8) |

---

## 13. Environment note

This development container has no Android SDK, and `dl.google.com` is blocked by
network policy, so it cannot be installed here. Consequences:

- `:core` (phase 1) can be fully built and tested here — which is a large part of why
  it's a separate module (§3).
- `:app` needs either a local machine with Android Studio, or a CI runner with the SDK
  image, to compile. Scaffolding, source, and Gradle config can all be written here and
  compiled elsewhere.
