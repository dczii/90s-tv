# Nostalgia Box — QR Selection + YouTube Channels

**Status:** proposed. Supersedes parts of [PRD.md](PRD.md), [ARCHITECTURE.md](ARCHITECTURE.md)
and [PLAN.md](PLAN.md) — each amendment below names what it replaces.
**Last updated:** 2026-09-13

A redesign of content acquisition. The app no longer downloads MP4s from a hosted
manifest. On first launch it shows a QR code; a phone on the same Wi-Fi opens a page
served by the TV itself, picks up to 5 YouTube videos, and confirms. Those 5 videos
become 5 channels, each looping on the wall clock exactly as already designed.

---

## 0. What this document does

The repo contained a complete design for an offline, download-based product. This
document records the decisions that changed it, the parts of the old design that
survive intact, the parts that are now dead, and a revised delivery plan.

Read it *after* ARCHITECTURE.md — it assumes §1 (the wall-clock invariant), §4
(`:core`), §6.4 (key handling) and the amendment-numbering convention (A1–A8). New
amendments here are numbered **B1–B14** to avoid collision.

---

## 1. Verdict

**Possible. Three things are being traded away, and one unknown can still void the plan.**

Traded away, deliberately:

| Lost | Why |
|---|---|
| **Offline operation** | YouTube cannot legitimately be downloaded. The app is online-only. PRD §8 "fully functional offline after initial provisioning" and the §11 acceptance line "works with the network disconnected" are both struck. |
| **Cross-device sync (ARCHITECTURE §1)** | Once each box plays 5 user-chosen videos, there is nothing for two boxes to agree on. The emergent "two TVs showing the same frame" property is gone. The invariant that produced it still holds; only the shared input is gone. |
| **The sub-second channel switch (PRD §8)** | `loadVideoById` is a network fetch plus buffering. <1s was plausible for local files and is not for YouTube. See B9. |

Gained: the entire content track (C1–C3, 6–8 days) and the entire download engine
(P3, 4–5 days) are deleted. Net schedule is roughly flat despite a new pairing phase,
because what replaced them is much smaller than what they were.

**The unknown that can void this plan: the YouTube IFrame Player API inside an Android
TV WebView.** It is the sanctioned way to embed YouTube, but TV WebView builds are
older and less predictable than phone ones, and nothing downstream matters if autoplay,
`seekTo`, or `getDuration` misbehave on the target box. **Spike this before anything
else** — see P−1 in §7.

---

## 2. The decisions

Settled. These are the inputs every amendment below derives from.

| # | Decision | Chosen |
|---|---|---|
| E1 | Playback | **YouTube streaming, online-only** — IFrame Player API in a WebView |
| E2 | Video→channel mapping | **5 videos = 5 channels, 1 video each** |
| E3 | Pairing transport | **LAN-local embedded HTTP server on the TV.** No backend, anywhere |
| E4 | Device targets | **Google TV *and* phone/tablet** |
| E5 | Duration discovery | **Read at runtime from the player.** No YouTube Data API key, no quota, no Google Cloud project |
| E6 | Launch behaviour | **Straight to TV.** The QR lives in the existing hidden settings screen as "change videos" |
| E7 | Pairing trust | **Open — anything on the LAN may post.** No token. Accepted risk, see B12 |
| E8 | Phone selection UI | **The same web page, loaded in-app** — one HTML asset, two transports |
| E9 | Division of responsibility | **The paired web page never plays video — it only collects links. All playback lives in the installed app** (B16) |

Decisions **D1–D5** from PLAN.md Phase −1 are void (they concern manifests, hosting and
content size). **D6** (name one specific acceptance device) survives and matters more
than before: it is now the device the IFrame spike runs on.

---

## 3. The revised product

### 3.1 First run

1. Launch → no saved selection → **pairing screen**: a QR code, the URL in large text
   beneath it as a fallback, and the TV's Wi-Fi network name so a user on the wrong
   network can tell.
2. Phone scans → browser opens `http://<tv-lan-ip>:<port>/` → selection page.
3. User pastes up to 5 YouTube URLs or video IDs. The page validates each as it is
   entered and shows a thumbnail (via `img.youtube.com`, no API key needed).
4. User presses **Confirm**. The page POSTs the list to the TV.
5. TV stores the selection, builds 5 channels, and tunes to channel 01 at its
   wall-clock offset. The pairing screen disappears.

### 3.1.1 The division of responsibility (E9)

The scanned page and the app are two different things and must not drift toward each
other. This is the rule:

| | Paired web page (in a phone browser) | Installed app (TV or phone) |
|---|---|---|
| **Purpose** | Collect up to 5 YouTube links. That is all | Show the QR, and be the television |
| **Plays video** | **Never** | Yes — the only place playback happens |
| **Holds the 90s TV design** | No. It is a plain, fast form | Yes — channel bug, no-signal slate, static, all of it |
| **Knows the wall clock** | No. It has no notion of channels or offsets | Yes. `resolve(now)` lives here |
| **Lifetime** | Seconds, while someone is pasting links | The life of the install |
| **Served by** | The app's embedded LAN server, while pairing is open | n/a |

The web page is an **input surface**. It hands over a list of video IDs and is done. It
never learns what is playing, never renders a player, and is never the product.

### 3.2 Everyday use

Unchanged from PRD §10.2. Power on → channel 01 already playing mid-video. D-pad
up/down flips channels, channel bug flashes. No menus.

### 3.3 Changing the videos (E6)

Long-press OK → hidden settings → **"Change videos"** → the same QR screen as first
run. On a phone/tablet build the same entry point opens the selection page in-app
instead of rendering a QR (B13).

---

## 4. The invariant still holds

> Playback position is a pure function of the wall clock. It is never stored, never
> restored, and never advanced by us.

With one video per channel (E2), ARCHITECTURE §4.2 collapses to:

```
offsetMs = floorMod(nowEpochMs, durationMs)
```

Every consequence in ARCHITECTURE §1's table survives: no resume position (FR1), this
*is* the tune-in function (FR2), switching is asking the clock a different question
(FR6), there is no state a user can move (FR8/FR9), switching away and back lands live
(§11). Lifecycle safety is unchanged — re-attaching is a fresh `resolve(now)`.

**What no longer follows** is the cross-device property. It required a shared divisor;
each box now has its own.

---

## 5. Amendments to the PRD

### B1 · Content source, replacing §5 entirely

§5 (hosted manifest, download behaviour, storage) is struck. Replaced by: the app holds
a **local selection** of up to 5 YouTube video IDs, acquired via LAN pairing (§3.1) and
persisted on device. There is no manifest, no CDN, no media on disk, no `sha256`, no
`sizeBytes`, no integrity verification, and no storage footprint beyond a few hundred
bytes of settings.

Consequently struck: FR10, FR11, FR13 (all manifest/download requirements), the §5.3
storage layout, the §8 low-space warning, the §11 acceptance lines for downloading and
for resuming interrupted downloads, and PRD §13's open questions (all four were about
hosting and content size).

FR12 survives in amended form: the hidden settings screen no longer sets a manifest URL;
it opens the pairing screen and shows diagnostics.

### B2 · Online-only, replacing the offline NFRs

PRD §8 "Resilience: fully functional offline after initial provisioning" is struck and
inverted: **the app requires network for all playback.** Loss of network is a
first-class runtime state, not an edge case (B10).

### B3 · Channel count is now 0–5, not exactly 5

PRD §6's five themed channels are struck — content is user-chosen. The app must behave
correctly for a selection of 1, 2, 3, 4 or 5 videos. `ChannelSelector` wraparound (FR5)
must wrap across *however many* channels exist, and a 1-channel selection must not make
up/down a no-op loop that looks broken.

Channel names come from the video title where the player reports one, falling back to
`CH 0n`. The channel bug (FR7) shows whatever is available.

### B4 · Ads will play

YouTube serves ads. An ad is not part of the video timeline, so during one the player's
position has no relationship to our computed offset. This is visible, unavoidable
through the sanctioned API, and must be stated as product behaviour rather than
discovered as a bug. The drift corrector must stand down during ads (B8).

### B5 · Videos can become unplayable at any time, remotely

A selected video can be deleted, made private, region-blocked, or have embedding
disabled by its owner — after selection, with no warning. The app must treat each
channel's availability as revocable and show the no-signal slate for that channel
without affecting the others. The selection page must reject non-embeddable videos at
*selection* time where it can, so the common case fails on the phone rather than as a
black screen on the TV.

Livestreams and premieres have no fixed duration and must be rejected outright — they
would break `floorMod`.

### B6 · Phone/tablet is a supported target (E4)

PRD §8 "Compatibility: Google TV / Android TV, D-pad-only navigation" is amended:
**single APK, both form factors.** Concretely:

- `uses-feature android.software.leanback` → `required="false"` (at `true`, the app will
  not install on a phone)
- `android.hardware.touchscreen required="false"` stays
- Manifest declares **both** `LEANBACK_LAUNCHER` and ordinary `LAUNCHER` categories
- Landscape is forced on both form factors. This is a TV simulator; portrait would
  letterbox a 16:9 illusion into a stripe
- Touch gesture equivalents for the §6.4 key table (B14)

FR14 is satisfied on TV as before, and additionally the app appears in the normal phone
launcher.

---

## 6. Amendments to the architecture

### B7 · `:core` survives almost intact — keep the list-of-slots shape

With one video per channel, `Lineup` is degenerate: one `Slot`, `totalMs ==
slot.durationMs`, and `TuneInResolver`'s binary search always returns index 0.

**Keep the general shape anyway.** The N-slot model costs nothing at N=1, the property
tests in PLAN P1 are already written against it, and it is the only thing that makes
"more than one video per channel" a later non-event instead of a redesign. Collapsing
`Lineup` to a single duration field would be the one change in this document that is
expensive to undo.

| `:core` component | Fate |
|---|---|
| `Slot`, `Lineup`, `IdealSlot` | **Keep.** `Slot.fileId: String` (sha256) becomes `videoId: String` |
| `TuneInResolver.resolve` | **Keep unchanged.** `floorMod` + binary search, N=1 |
| `ChannelSelector` | **Keep**, amended for 0–5 channels (B3) rather than exactly 5 |
| `LineupBuilder` | **Keep**, trivial at N=1 — cumulative `startMs` over declared durations |
| `AvailabilityProjector` | **Keep**, and it gets *simpler and better defined*: at N=1 an unavailable video means the channel is no-signal. There is nothing to skip to |
| `Channel`, `MediaFile`, `FileStatus` | **Replace** with `Selection`, `SelectedVideo`, `VideoStatus` |
| `manifest/` DTOs, `ManifestValidator` | **Delete.** Replaced by `SelectionValidator` — video ID format, count ≤ 5, no duplicates |
| `ManifestDiffer` | **Delete.** A new selection replaces the old one wholesale; there is nothing to diff |

The P1 property tests survive as written: slots tile `[0, totalMs)`, `resolve(t) ==
resolve(t + totalMs)`, wraparound, `now` at 0, negative `now`. The A1 assertion
("adding a file changes the phase; marking one unavailable does not") stays meaningful
and should still be written — it is what stops someone later computing `totalMs` from
available videos instead of selected ones.

### B8 · Duration discovery and the first-tune-in compromise (E5)

No API key means no duration until the player reports one. Consequences:

```
selection stored  ->  durationMs = null  (unknown, not zero)
first tune to Ch0n -> load video at position 0
                   -> onReady / first PLAYING state
                   -> getDuration() returns real seconds
                   -> cache it, then seekTo(floorMod(now, dur))
subsequent tunes   -> duration known from cache, correct from the first frame
```

So **each channel is visibly wrong exactly once, ever** — it starts at 0 and jumps to
the live position within roughly a second of load. After that the cached duration makes
it correct forever. Cache durations keyed by `videoId`, persisted, never re-probed.

Three traps:

1. `getDuration()` returns `0` until metadata loads. **`0` means "not yet known", never
   "zero-length".** Conflating them yields a division by zero in `floorMod`. Guard it.
2. While an ad is playing, the reported duration is not reliably the video's. Read
   duration only once the player is in a settled playing state on the actual video, and
   treat a duration that later changes materially as the real one superseding an ad's.
   **Verify this behaviour in the P−1 spike** — the exact reporting during ads is the
   kind of thing that differs by client version.
3. The `start` playerVar takes **integer seconds only**. For sub-second accuracy, load
   then `seekTo(float)`. `start` also applies only on initial load, not on
   `loadVideoById`.

**Rejected: YouTube Data API v3 for durations.** It gives exact durations up front plus
titles, thumbnails and the `status.embeddable` check, which would eliminate trap 1
entirely and make B5's selection-time rejection reliable. Declined per E5 to avoid an
API key in the APK, a quota ceiling and a Google Cloud dependency. **This is the
cheapest decision here to revisit** — it is one HTTP call and it removes the only
user-visible correctness artifact in the design.

### B9 · Channel-switch latency, replacing PRD §8's <1s budget

`loadVideoById` is a network fetch plus buffer fill. A realistic target is **2–5s**, not
<1s. PRD §8's sub-second requirement is struck and replaced with: **the channel bug
appears instantly on keypress, and the new channel's first frame arrives as fast as the
network allows.** Perceived responsiveness comes from the overlay, not from the video.

Escalation path if measured latency is unacceptable on the D6 device, in order:

1. **Keep the ~350ms selection debounce** from ARCHITECTURE §6.1. It matters *more* now,
   not less — each intermediate channel is a wasted network fetch.
2. **Two-player ping-pong.** A second WebView pre-cues the likely next channel based on
   the last D-pad direction; switching becomes unmute + seek. Roughly halves perceived
   latency for directional flipping.
3. **Do not attempt five simultaneous players.** ARCHITECTURE §6.6 notes TV boxes have
   few hardware decoder instances; five concurrent YouTube players will exhaust them.
   Two is the realistic ceiling.

### B10 · Network loss is a first-class state (B2)

No network means no channel plays at all — the worst failure mode in the product, and
new. Required behaviour:

- Observe connectivity. On loss, show the no-signal slate **with a cause** ("No signal —
  check your connection"), not a generic black screen.
- On restore, re-derive `resolve(now)` and resume automatically. Never require a keypress
  to recover, and never require an app restart.
- Distinguish "this one video is gone" (B5, per-channel) from "the network is down"
  (all channels). The user flipping channels to diagnose is the natural behaviour, and
  they should reach a screen that tells them which it is.

### B11 · Player layer: IFrame in a WebView, replacing ARCHITECTURE §6

ExoPlayer/Media3 is out. This is the largest rewrite in the document.

**The origin problem, and why it is load-bearing.** The IFrame API wants to be hosted on
a real http(s) origin and passed a matching `origin` player var; loading it via
`loadData`/`about:blank` is unreliable. Two workable hosts, and they should be used for
*different* things:

- **Player page → `WebViewAssetLoader`**, served at `https://appassets.androidplatform.net/`.
  A real HTTPS origin, no cleartext exemption needed, no port to collide with.
  This is the recommended host for the player.
- **Pairing/selection page → the embedded LAN server** (E3). It must be reachable from
  another device, so it has to be a real socket on the LAN.

The embedded server therefore earns its keep once, not twice, and the player avoids
depending on it.

**WebView settings that are not optional:**

| Setting | Why |
|---|---|
| `mediaPlaybackRequiresUserGesture = false` | **Without this nothing autoplays at all.** The single most common way this phase appears broken |
| `javaScriptEnabled = true`, `domStorageEnabled = true` | IFrame API requirements |
| Hardware acceleration on, `WebChromeClient` set | Video rendering |

**Player vars for the illusion:** `autoplay=1`, `controls=0`, `disablekb=1`, `fs=0`,
`rel=0`, `iv_load_policy=3`, `playsinline=1`, `origin=<asset-loader origin>`.

**Mapping the old design onto the new player:**

| ARCHITECTURE § | Old mechanism | New mechanism |
|---|---|---|
| §6.1 single debounced player | `ExoPlayer` + `setMediaItems` | One `YT.Player` + `loadVideoById({videoId, startSeconds})`. Debounce survives unchanged |
| §6.1 `REPEAT_MODE_ALL` looping | ExoPlayer playlist repeat | `onStateChange == ENDED` → re-seek via the clock. Not `loop=1`: we want the clock to decide, not the player |
| §6.2 `CLOSEST_SYNC` seeking | `SeekParameters` | No equivalent; YouTube decides. The GOP/keyframe reasoning in A5 and the whole C2 encode spec become moot |
| §6.3 drift correction | 30s ticker + `onMediaItemTransition` | 30s ticker + `ENDED` + `onStart` + `ACTION_TIME_CHANGED`, comparing `getCurrentTime()` against `resolve(now)`. **Keep the 2-second dead zone** — correcting small drift is a visible micro-seek. **Stand down entirely while an ad plays** (B4) |
| §6.4 outward lockdown via `ForwardingPlayer` | Command removal | `controls=0` + `disablekb=1` + intercept keys at the Activity. Weaker: YouTube branding and the title card can still surface on interaction. The illusion is leakier than Media3's and that is a real cost of E1 |
| §6.4 inward freedom (raw player) | Raw `ExoPlayer` reference | The JS bridge. Same principle: the restriction is user-facing, we still seek freely |
| §6.5 per-file `UNPLAYABLE` | `onPlayerError` → Room | `onError` codes **100** (not found/private), **101/150** (embedding disabled), **2** (bad param), **5** (HTML5 error) → mark the channel no-signal (B5) |
| §6.6 lifecycle | Player in `onStart`, released in `onStop` | Unchanged, and for the same reason: no position to preserve |
| A6 "no MediaSession" | Decision | **Still holds, and still for the same reason.** Publishing one hands pause back to the system transport and Assistant |

The §6.4 key table itself is unchanged and remains correct, including number-key direct
tune and long-press-OK for settings.

### B12 · Pairing server, and the security posture (E3, E7)

An embedded HTTP server — Ktor CIO or NanoHTTPD — bound to the LAN interface, serving:

```
GET  /            the selection page (one HTML asset, no framework)
POST /selection   {"videos":[{"videoId":"..."} × ≤5]}
GET  /state       current selection, so the page can show what is already set
```

**Access control: none, per E7.** Anything on the LAN may post a new selection. The risk
this accepts, stated plainly so it is a decision and not an oversight: *anyone on the
same Wi-Fi who finds the port can change what the household TV is playing, to any
YouTube video.* On a trusted home network that is fine. On a shared-SSID apartment
building or a guest network it is not. Two free mitigations that do not reintroduce a
token:

- Bind to the LAN interface only, and **run the server solely while the pairing screen
  is open.** A closed socket is the cheapest access control there is, and it costs
  nothing given E6 already confines pairing to first run and the settings screen.
- Do not advertise via mDNS/NSD. Discovery should require the QR.

**Input validation is NOT access control and is not optional.** The submitted video IDs
are rendered into the selection page and handed to the player. Required regardless of
E7:

1. Validate every ID against `^[A-Za-z0-9_-]{11}$` and **reject** anything else. Accept
   full URLs only by parsing out the `v=`/`youtu.be/` ID and validating that.
2. Cap the list at 5 and reject duplicates.
3. Pass IDs into the WebView via `evaluateJavascript` with **JSON encoding**, never
   string concatenation. Unvalidated text concatenated into JS is script injection into
   our own WebView — which, alongside a `@JavascriptInterface` bridge (B13), is the one
   place in this design where a LAN peer could reach beyond changing the channel.
4. Bound the request body size. An unbounded POST into a TV box is a trivial DoS.

Items 1–4 are correctness and safety, not a trust model, so E7 does not waive them.

### B13 · One selection page, two transports (E8)

The selection page is a single HTML asset shipped in the APK. It detects its transport
at runtime:

```js
const submit = window.NostalgiaBridge
  ? (sel) => window.NostalgiaBridge.submit(JSON.stringify(sel))   // in-app (phone)
  : (sel) => fetch('/selection', {method:'POST', body: JSON.stringify(sel)});
```

- **On TV**, the page is served over the LAN to a phone browser and uses `fetch`.
- **In-app on phone/tablet**, the page is loaded through `WebViewAssetLoader` and submits
  through a `@JavascriptInterface` bridge.

This is ~15 lines of JS and it buys a lot: one selection UI, no divergence between two
implementations, and the phone build needs neither a cleartext-HTTP exemption for
`127.0.0.1` nor a mixed-content exemption for `fetch`ing a local socket from an HTTPS
origin. `addJavascriptInterface` is acceptable here specifically because the page is our
own bundled asset rather than remote content — but the payload it receives still goes
through B12's validation, because on TV that same payload arrives from the LAN.

### B14 · Touch input on phone/tablet (E4, B6)

The §6.4 key table needs touch equivalents for the phone build. Minimum viable:

| Gesture | Action |
|---|---|
| Swipe up / down | Previous / next channel, wrapping (FR5) |
| Single tap | Show the channel bug for ~3s (FR7) |
| Long press | Hidden settings (FR12) |
| — | **No** scrub bar, **no** play/pause affordance, ever (FR8/FR9) |

The temptation here is to add a tap-to-pause because phones have one. Resisting it is
the product.

### B15 · Persistence: Room is out

ARCHITECTURE §5.2 chose Room because download workers needed transactional per-file
status and the UI needed to observe file completion as a `Flow`. **Both reasons are
gone.** What persists now is: up to 5 video IDs with cached titles and durations, the
last-watched channel, and a log ring buffer. That is a handful of records.

**Use DataStore (Preferences or Proto) with a serialized selection. Drop Room, drop the
DAOs, drop the migrations.** Hilt stays — it is still the right shape for the remaining
wiring, and it is less work than hand-rolling it.

### B16 · Two HTML surfaces, and the LAN server serves only one of them (E9)

The design contains two HTML pages, which are easy to conflate and must not be:

| | **Selection page** | **Player page** |
|---|---|---|
| Does | Collects up to 5 links | Runs the YouTube IFrame player |
| Served from | The embedded LAN server (B12), and loaded in-app on phone via `WebViewAssetLoader` (B13) | `WebViewAssetLoader` only — `https://appassets.androidplatform.net/` |
| Reachable from the LAN | **Yes, by design** | **No. Never** |
| Contains a `<video>` or an IFrame player | No | Yes |
| Contains the TV design | No | It *is* the picture; the design overlays it in Compose |

**The constraint, stated so it can be tested:** the embedded LAN server exposes
`GET /`, `GET /state` and `POST /selection` and **nothing else**. No static-file handler,
no directory serving, no route that can reach the player page or any other app asset. A
LAN peer must be able to submit links and read back the current selection, and must not
be able to fetch anything else out of the app.

Two practical consequences:

1. **Do not implement the server with a catch-all static handler** pointed at the assets
   directory. It is the obvious convenience and it would expose the player page, the
   JS bridge surface, and whatever else ships in assets. Register the three routes
   explicitly.
2. **The player page keeps its own origin.** It stays on the asset-loader HTTPS origin
   rather than being served off the LAN port, which is why B11 recommended that host in
   the first place. Moving it to the LAN server to "reuse the plumbing" would give it an
   `http://` origin, require a cleartext exemption, and put the player one URL guess away
   from any device on the network. Don't.

---

## 7. Revised delivery plan

### Deleted outright

| Was | Days | Why |
|---|---|---|
| C1 Source and clear content | 3–5 | Content is user-chosen |
| C2 Transcode pipeline + manifest generator | 2 | No media to transcode, no manifest to generate |
| C3 Host and verify | 1 | Nothing to host. The HTTP Range requirement (A4) is moot |
| P3 Download engine | 4–5 | No downloads |
| **Total removed** | **10–13** | |

The entire parallel content track is gone, and with it PLAN.md's "single most common way
this project stalls" (reaching P3 with nothing to download). The critical path is now one
track.

### Phases

**P−1 · IFrame spike on real hardware — 0.5–1 day. Do this first.**

Nothing downstream is safe until this passes. A bare WebView, the IFrame API, one
hardcoded video, on the actual D6 device:

- [ ] It plays at all, and **autoplays** without a gesture
- [ ] `getDuration()` returns a real duration, and when — before or after any ad
- [ ] `seekTo(n)` lands where asked, and how long it takes
- [ ] `loadVideoById` switch latency, measured (feeds B9)
- [ ] What YouTube chrome/branding appears on interaction (feeds B11's leakier-illusion note)
- [ ] Behaviour of error codes 100/101/150 with a deliberately private and a deliberately
      non-embeddable video

**Exit.** A short written finding per bullet. If autoplay or `getDuration` fails on the
target box, stop and revisit E1 before writing anything else.

**P0 · Scaffold — 1–2 days.** As PLAN.md, amended: `leanback required="false"`, both
launcher categories, single APK for TV and phone (B6). Still the only phase needing the
Android SDK before P2.

**P1 · `:core` — 2–3 days** (was 3–4). As PLAN.md, amended per B7: keep the lineup and
resolver shape and their property tests; swap `sha256`→`videoId`; replace the manifest
DTOs and validator with `Selection`/`SelectionValidator`; delete `ManifestDiffer`;
`ChannelSelector` handles 0–5 channels (B3). Still builds and tests with no Android SDK,
which is still why the module split is worth having.

**P2 · Selection, pairing and persistence — 3–4 days.** New, replacing old P2+P3.

- [ ] Embedded HTTP server, LAN-bound, **running only while the pairing screen is open** (B12),
      with **exactly three explicitly registered routes and no static-file handler** (B16)
- [ ] QR rendering (ZXing), with the URL in large text and the Wi-Fi network name beneath
- [ ] The selection page: paste URL or ID, thumbnail preview via `img.youtube.com`,
      client-side ID extraction and validation, reorder, confirm
- [ ] Server-side validation per B12 items 1–4 — **the non-negotiable part of this phase**
- [ ] The `@JavascriptInterface` bridge and the transport-detection shim (B13)
- [ ] DataStore persistence of the selection, cached durations and last-watched channel (B15)

**Exit.** Pair from a phone, kill the app, relaunch: the selection persisted and the app
goes straight to playback (E6). Post a malformed ID, an 80-char ID, 9 videos, and a
10 MB body — all four rejected without a crash. `curl` the LAN port for the player page,
for `../` traversal, and for any other asset path — all refused (B16). The page itself
renders no player on any device.

**P3 · Player — 4–6 days.** Per B11. The risk concentration, as before, but the risk has
moved: it is now WebView behaviour rather than decode performance, and P−1 has already
taken most of it out.

- [ ] `WebViewAssetLoader`-hosted player page; `mediaPlaybackRequiresUserGesture = false`
- [ ] Tune-in: `loadVideoById` + `seekTo(floorMod(now, dur))`
- [ ] Duration discovery, caching, and the `0`-means-unknown guard (B8)
- [ ] Loop on `ENDED` through the clock, not via `loop=1`
- [ ] Drift correction: 30s ticker, 2-second dead zone, **suppressed during ads** (B4, B8)
- [ ] The §6.4 key table, unchanged, plus B14's touch gestures
- [ ] ~350ms selection debounce; channel bug updates instantly regardless (B9)
- [ ] Error codes 100/101/150/2/5 → per-channel no-signal (B5)
- [ ] Connectivity observation → all-channel no-signal, with auto-recovery (B10)
- [ ] Measure key-event → first frame; record it against B9

**P4 · Overlays and settings — 2–3 days.** As PLAN.md P5, amended: the no-signal slate
now carries a cause (B10); settings shows "Change videos" (→ QR on TV, in-app page on
phone) instead of a manifest URL; no storage footprint to display; the setup-progress
overlay is deleted (nothing downloads). Ring-buffer log to `filesDir` survives and
matters more — it is still the only diagnostic that exists.

**P5 · Hardening and acceptance — 2–3 days.** As PLAN.md P6, against an amended
checklist (§8 below). New passes: pull the network mid-playback and restore it; make a
selected video private and confirm one channel goes no-signal while the others play;
select a livestream and confirm rejection; 24h soak for drift and WebView memory growth.

**P6 · Stretch — unscheduled.** Reordered by value, see §9.

### Summary

| Phase | Days | Ends with |
|---|---|---|
| P−1 Spike | 0.5–1 | IFrame proven on real hardware, or E1 revisited |
| P0 Scaffold | 1–2 | Installs on TV *and* phone |
| P1 `:core` | 2–3 | Clock tested, no SDK needed |
| P2 Selection + pairing | 3–4 | Pair from a phone; selection persists |
| P3 Player | 4–6 | Channels play at their wall-clock offset |
| P4 Overlays | 2–3 | FR7, FR12, no-signal with cause |
| P5 Hardening | 2–3 | Amended acceptance checklist passes |

**≈15–22 days, single track** (was ≈20–27 app-track days plus a 6–8 day parallel content
track). The win is not the headline number — it is that there is no longer a second track
to keep in sync, and no content-sourcing phase to underestimate.

---

## 8. Amended acceptance criteria

Replacing PRD §11.

- [ ] App installs on Google TV and appears on the home row; installs on a phone and
      appears in the normal launcher
- [ ] First run shows a QR code; a phone on the same Wi-Fi can select up to 5 videos and
      confirm
- [ ] Confirmed videos become channels and begin playing automatically, mid-video, with
      no menu
- [ ] D-pad up/down flips through the selected channels with a channel bug overlay, and
      wraps correctly for a selection of 1 through 5
- [ ] Tune-in is time-based: switch away, wait a minute, switch back — it has moved on
- [ ] Play/pause does not pause; no rewind or seek is reachable
- [ ] Selection survives a restart; the app goes straight to playback, no QR (E6)
- [ ] "Change videos" in hidden settings re-opens pairing and replaces the selection
- [ ] A malformed, over-long, over-count or oversized submission is rejected without a crash
- [ ] A video that becomes private or non-embeddable takes out only its own channel
- [ ] Network loss shows a no-signal slate with a cause, and recovers automatically
      without a keypress or restart
- [ ] On a phone build, the selection page opens in-app and swipe/tap gestures work
- [ ] The paired web page plays no video and renders no player — it collects links only (E9)
- [ ] The LAN server answers only `GET /`, `GET /state` and `POST /selection`. Requests for
      the player page, or any other app asset, are refused (B16)

Struck from §11: the download, offline, and resume-interrupted-download lines.

---

## 9. Stretch, reordered

1. **YouTube playlist URLs as a channel source.** Highest value by a wide margin, and it
   directly repairs E2's main weakness (§10). One pasted URL yields many videos, which
   restores the varied-lineup illusion the original design had — and B7 kept the N-slot
   machinery precisely so this lands as a content change rather than a redesign.
2. **In-page YouTube search** instead of paste-only. Needs the Data API key that E5
   declined; pairs naturally with revisiting B8.
3. **Static-noise transition on channel change.** Still the cheapest sell of the
   illusion, and now it usefully masks B9's switch latency as well.
4. Two-player ping-pong (B9 step 2), if measurement demands it.
5. Auto-launch on boot (FR15) — unchanged from A7: device-dependent, time-box it.
6. CRT shader — **substantially harder now.** Media3 Effects operated on our own decode;
   a WebView surface does not offer the same hook. Treat as a research item, not a task.
7. More than 5 videos; per-channel multi-video lineups; favourites and reordering.

---

## 10. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| IFrame API misbehaves in Android TV WebView | **Voids the plan** | P−1 spike before anything else. Nothing downstream is committed until it passes |
| A channel that is one looping video is a thin illusion (§11) | High, by design | Accepted under E2. Playlist support (§9 item 1) is the repair, and B7 keeps it cheap |
| Ads break the broadcast feel and the clock sync | High | Unavoidable via the sanctioned API. Documented as behaviour (B4); corrector stands down (B8) |
| Switch latency well above 1s | Medium | B9's escalation path. Channel bug carries perceived responsiveness |
| Videos silently become unplayable | Medium | Per-channel no-signal (B5); selection-time rejection where possible |
| Network drop = no TV at all | Medium | B10. Cause-carrying slate and automatic recovery |
| YouTube API Services ToS compatibility | **Needs a human** | See §11 |
| LAN peer changes what the TV plays | Accepted (E7) | Server only runs while pairing is open; no mDNS; B12 validation regardless |
| First tune-in to each channel starts at 0 | Low | Self-correcting within ~1s, once per video ever (B8). Eliminated entirely by revisiting E5 |
| WebView memory growth across many channel changes | Low–medium | 24h soak in P5 |

---

## 11. Open questions

1. **YouTube API Services Terms of Service.** The IFrame API is the sanctioned embedding
   path, and `controls=0` is a supported player var — but this product hides controls,
   suppresses pause, autoplays indefinitely, and presents YouTube content as "channels".
   Someone should read the YouTube API Services ToS and developer policies against this
   specific design, particularly the provisions on modifying the player, on ad display,
   and on presenting content outside the standard player experience. **This is a legal
   review, not an engineering question, and it is worth doing before P3** — it is the one
   remaining item that could change the product rather than the implementation.
2. **Revisit E5 (Data API) after P−1?** If the spike shows `getDuration()` is awkward
   around ads, the API key buys exact durations, reliable non-embeddable rejection,
   titles and thumbnails for one HTTP call. Cheap to change now, annoying later.
3. **What does a 1-video selection do on up/down?** Wrapping to itself looks broken.
   Suppress the keypress, or show the bug and nothing else? A UX call (B3).
4. ~~**Does the phone build actually play video, or only select?**~~ **Resolved (E9).**
   Playback lives in the installed app on every form factor, so the phone/tablet build is
   a full second screen: it shows the QR, and it plays. B6 and B14 stand as written. What
   is settled alongside it is the stronger half of the rule — the *paired web page* never
   plays anything on any platform (B16).
