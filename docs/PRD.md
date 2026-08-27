# Nostalgia Box — Product Requirements Document (PRD)

**Product:** Nostalgia Box
**Platform:** Google TV (Android TV OS)
**Version:** 1.0 (MVP)
**Last updated:** 2026-08-26

---

## 1. Overview

Nostalgia Box is a self-contained Android TV app that recreates the feeling of old broadcast television: algorithm-free, menu-free, "just watch what's on." On launch, a channel is already playing mid-program (based on wall-clock time), and the D-pad flips channels like an old antenna TV. There is no pausing, no rewinding, and no content selection menu — the lean-back, no-choice experience is the entire point.

Unlike the original inspiration (which loaded content locally), **channel content is downloaded from an online source** so the box can be provisioned and updated over the network. The MVP ships with **5 channels**.

---

## 2. Goals & Non-Goals

### Goals (MVP)

- Recreate the broadcast-TV illusion: always-on, mid-program tune-in, no pause/rewind.
- Ship **5 channels**, each a themed loop/schedule of video content.
- **Download channel content from an online link** (a hosted manifest + media files), not bundled in the APK.
- Run entirely inside a Google TV — no companion device or server required at runtime.
- D-pad channel flipping with an on-screen channel bug.

### Non-Goals (MVP)

- No live streaming / real broadcast feeds.
- No user accounts, profiles, or cloud sync.
- No content-creation or upload tooling.
- No pause, rewind, DVR, or on-demand selection.
- No monetization, ads, or analytics beyond basic local logging.
- CRT shader and static transitions are **stretch**, not required for MVP acceptance.

---

## 3. Target User

A household (often with kids) that wants curated, calming, choice-free TV — no infinite scroll, no autoplay rabbit holes, no algorithm. The primary operator is technical (able to host files and configure a manifest URL); the day-to-day users just press power and channel up/down.

---

## 4. Key Concepts

- **Channel:** A named, ordered playlist of video files with a total duration and optional daily schedule.
- **Manifest:** A JSON file, hosted online, describing all channels and where to fetch their media.
- **Tune-in offset:** The wall-clock-derived position a channel is at when you switch to it, so it always feels "already running."

---

## 5. Content Delivery (Online Download)

### 5.1 Source of truth: a hosted manifest

The app is configured with a single **manifest URL** (settings screen or build-time constant). On first run and on refresh, the app fetches this manifest and downloads the referenced media.

Example `manifest.json`:

```json
{
  "version": 1,
  "updatedAt": "2026-08-26T00:00:00Z",
  "channels": [
    {
      "id": 1,
      "name": "Cartoons",
      "number": "01",
      "files": [
        { "url": "https://cdn.example.com/ch1/toon-a.mp4", "durationSec": 640, "sha256": "..." },
        { "url": "https://cdn.example.com/ch1/toon-b.mp4", "durationSec": 720, "sha256": "..." }
      ],
      "schedule": null
    }
  ]
}
```

- Each file entry carries a **URL**, **duration** (so the app can compute offsets without probing), and an optional **sha256** for integrity.
- `schedule` is optional; `null` means "pure loop."

### 5.2 Download behavior

- On first launch: fetch manifest → download all media to app-private/external storage → show a simple "Setting up your channels…" progress screen.
- Downloads run with **WorkManager** (survives app restart, retries on failure, resumes where possible).
- Verify each file's `sha256` if provided; re-download on mismatch.
- Support partial availability: a channel becomes playable as soon as at least one of its files is downloaded; the rest fill in.
- **Refresh:** manual "Update channels" action in a hidden settings screen, plus an optional periodic background check (e.g. daily) comparing manifest `version`.
- **Offline resilience:** once downloaded, everything plays with no network. Network is only needed for initial provisioning and updates.

### 5.3 Storage

- Media stored under app external files dir (`getExternalFilesDir`), one subfolder per channel.
- Cache eviction is out of scope for MVP (assume enough storage for 5 channels); log total footprint.

---

## 6. The 5 Channels (MVP)

Exact content is defined by the hosted manifest, but the MVP targets 5 distinct themed channels, e.g.:

| # | Channel | Theme |
|---|---------|-------|
| 01 | Cartoons | Vintage public-domain animation |
| 02 | Nature | Calm wildlife / landscapes |
| 03 | Rabbit (Kids) | Gentle kids' storytime content |
| 04 | Retro Ads | Nostalgic commercials & bumpers |
| 05 | Classics | Old public-domain shorts / serials |

Content should be sourced from legally reusable material (e.g. public-domain collections on the Internet Archive) and transcoded to a uniform codec (H.264 video / AAC audio) before hosting.

---

## 7. Functional Requirements

### 7.1 Playback

- **FR1:** On app launch, immediately begin playing the last-watched channel (or channel 01 on first run) at its wall-clock offset — no home menu.
- **FR2:** Compute tune-in position as `(epochSeconds) % channelTotalDurationSec`, resolve to file + intra-file offset, and seek there.
- **FR3:** Loop each channel's playlist indefinitely.
- **FR4:** If a channel has a `schedule`, resolve the current program by time-of-day instead of pure loop.

### 7.2 Channel switching

- **FR5:** D-pad **Up/Down** (and `CHANNEL_UP`/`CHANNEL_DOWN`) switch channels, wrapping around the 5 channels.
- **FR6:** On switch, recompute the tune-in offset for the new channel and seek.
- **FR7:** Show a **channel bug** overlay ("CH 03 · Rabbit") for ~3 seconds on switch, then fade out.

### 7.3 Broadcast illusion

- **FR8:** Ignore the play/pause key (or make it mute-only); the timeline never stops.
- **FR9:** No rewind, fast-forward, or seek controls exposed to the user.

### 7.4 Provisioning & updates

- **FR10:** Fetch the manifest from the configured URL and download all referenced media.
- **FR11:** Show setup progress on first run; resume interrupted downloads.
- **FR12:** Provide a hidden/long-press settings screen to set/change the manifest URL and trigger "Update channels."
- **FR13:** Verify file integrity via sha256 when present.

### 7.5 Lifecycle

- **FR14:** Appear on the Google TV home row via the leanback launcher intent.
- **FR15 (optional):** Auto-launch on device boot for "turn on = TV's on" behavior.

---

## 8. Non-Functional Requirements

- **Performance:** Channel switch completes in < 1s once media is downloaded; no visible buffering for local files.
- **Reliability:** Downloads retry with backoff; app never crashes on a missing/corrupt file — it skips to the next file and logs.
- **Resilience:** Fully functional offline after initial provisioning.
- **Compatibility:** Google TV / Android TV, min SDK ~21, D-pad-only navigation (no touch assumptions).
- **Footprint:** MVP assumes storage sufficient for 5 channels; warn if free space is low before downloading.

---

## 9. Technical Approach (reference, not binding)

- **Kotlin**, Android TV app.
- **ExoPlayer (AndroidX Media3)** for playback, looping, seeking, and (stretch) GL shader effects.
- **WorkManager** for resumable, retrying downloads.
- **OkHttp/Retrofit** (or Media3's own) for fetching manifest + files.
- Single full-screen **player Activity**; Leanback library only if a guide screen is added later.
- Manifest + media hosted on any static host / CDN / object storage reachable by URL.

---

## 10. User Flows

### 10.1 First run

1. App launches → checks for local media → none found.
2. Fetches manifest from configured URL.
3. Shows "Setting up your channels…" with per-channel progress.
4. As soon as channel 01 has a playable file, starts playing at its wall-clock offset.
5. Remaining media downloads in the background.

### 10.2 Everyday use

1. Power on → app auto-launches (if enabled) → channel already playing mid-program.
2. D-pad up/down to flip channels; bug flashes on each switch.
3. Power off — no save prompts, no menus.

### 10.3 Updating content

1. Operator opens hidden settings (e.g. long-press OK, or a key combo).
2. Selects "Update channels" (or app auto-checks daily).
3. App compares manifest `version`; downloads new/changed files; keeps playing during download.

---

## 11. Acceptance Criteria (MVP "done")

- [ ] App installs on Google TV and appears on the home row.
- [ ] On first run, app downloads all 5 channels from the hosted manifest URL.
- [ ] A channel begins playing automatically on launch, mid-program, with no menu.
- [ ] D-pad up/down flips through all 5 channels with a channel bug overlay.
- [ ] Tune-in position is time-based (switching away and back lands at the "live" position, not the start).
- [ ] Play/pause does not pause the broadcast; no rewind/seek is possible.
- [ ] After provisioning, the app works with the network disconnected.
- [ ] Interrupted downloads resume and complete without a full restart from zero.

---

## 12. Stretch / Post-MVP

- CRT shader (scanlines, vignette, chromatic aberration) via Media3 Effects.
- Static-noise transition clip on channel change.
- Per-channel daily schedules (time-of-day lineups) instead of pure loops.
- Auto-launch on boot.
- Storage cache eviction / size caps.
- Simple onboarding to enter the manifest URL via on-screen keyboard.
- More than 5 channels; channel favorites/reordering.

---

## 13. Open Questions

- Where will the manifest + media be hosted (own CDN, object storage, a public bucket)? Affects URL scheme and auth.
- Is the manifest URL fixed at build time for MVP, or user-configurable from day one?
- Do any channels need scheduling in MVP, or is pure loop acceptable for all 5?
- Target total download size per channel (affects first-run time and storage warnings).
