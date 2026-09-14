# Step 4 — Controlled Android TV playback

**Parent:** [Timed YouTube TV — Five-Step Plan](../YOUTUBE_TIMER_PLAN.md) §4
**Status:** blocked on Step 2 (`TimerEngine` events) and Step 3
(allowlist IDs + playability probe).
**Produces:** WebView + IFrame Player API, destroy-on-expiry, Compose TV
screens from the design brief, D-pad behavior. No ExoPlayer, no media
download, no `vnd.youtube` intent.

---

## Goal

Play only allowlisted YouTube IDs inside this process, and guarantee the
player object does not exist outside `Playing`. Watch expiry pauses,
destroys the WebView, and shows rest. Rest expiry shows confirmation
**without** constructing a WebView.

---

## Exit criterion

Copied from the parent plan and sharpened:

- [ ] Official YouTube IFrame Player API in an Android WebView. Page is
      served from `https://appassets.androidplatform.net/` via
      `WebViewAssetLoader` (not `file:///android_asset`, not
      `loadDataWithBaseURL("https://www.youtube.com", …)`). No extracted
      googlevideo URLs, no `Intent` to the YouTube app.
- [ ] Kotlin/JS bridge is the whitelist in `YT-D21` and nothing else.
      Playlists are expanded to video ids; the bridge has `loadVideo`
      only (no `loadPlaylist`).
- [ ] On any `PhaseChanged` whose `to` is not `Playing` (includes
      CycleReset): the destroy order below, main thread, idempotent.
      Race-safe if the player is buffering or an ad is playing.
- [ ] On rest complete: `AwaitingConfirmation`, no `AndroidView`, no
      `loadVideo`, no autoplay. Continue watching is the only door into
      a **new** watch window; restore into still-valid `Playing` may
      rebuild the WebView (YT-D23).
- [ ] Setup, Connect, content picker, confirmation, playback, rest, PIN
      settings are D-pad-first at 1920×1080 with 5% safe area, matching
      the brief’s calm palette.
- [ ] Embedding-disabled / private / age-restricted / region-restricted /
      removed IDs are skipped on **definitive** probe negatives. Transport
      / 401 / quota keep last-known and allow playback. If none remain
      playable, `NoPlayableItem` on confirmation; `confirmWatching` is
      not called.

---

## Read first

- [01](01-product-and-timer-rules.md), [02](02-persistent-timer-and-parent-controls.md),
  [03](03-youtube-connection-and-curation.md)
- [DESIGN_BRIEF.md](../../designs/DESIGN_BRIEF.md) — all eight screens
  and reusable components
- YouTube IFrame Player API reference (`YT.Player`, events, error codes)
- Step 2 non-negotiable: `onStart` → `tick` → attach a player only if still `Playing`

---

## Product / user-visible outcome

This step owns the visual product:

1. Welcome / Parent setup
2. Timer setup
3. Connect YouTube
4. Choose allowed content
5. Ready / Continue watching — artwork + scrim, “15 minutes available”
   (policy watch duration), primary Continue watching, no autoplay
6. Playback — full-bleed 16:9 WebView, remaining-time pill (upper-right,
   amber in last 60s), brief title overlay on Info/remote, **no** app
   chrome over required YouTube controls
7. Rest timer — player **absent**, countdown ring, “Time for a break”,
   parent settings secondary
8. Parent settings — PIN-gated; policy; manage content; connect/
   disconnect; reset cycle destructive

---

## Technical design

### Origin (YT-D20)

`androidx.webkit` `WebViewAssetLoader` serves `assets/` from
`https://appassets.androidplatform.net/`. Load the player page from that
https origin. `playerVars.origin` **matches** that origin.
`enablejsapi=1`.

Rejected: `file:///android_asset` (opaque / wrong origin; JS API will
not handshake). Rejected: `loadDataWithBaseURL("https://www.youtube.com",
…)` (wrong origin, ToS-adjacent). Add `appassets.androidplatform.net` to
the navigation allowlist.

### Player host

One `assets/youtube_player.html` that loads the IFrame API and creates
`YT.Player` only when Kotlin calls `loadVideo`. WebView settings: JS on,
DOM storage on, media playback without user gesture **allowed** (we
already had an explicit Continue watching click — that is the gesture
the product recognizes). `setMixedContentMode` never needed; asset +
HTTPS via the asset loader.

`shouldOverrideUrlLoading` is **navigations only**. Allow
`appassets.androidplatform.net`, `youtube.com`, `youtu.be`,
`google.com` (auth widgets inside the iframe), `ytimg.com`,
`gstatic.com`. **Block and do not `ACTION_VIEW` anything else.** Do
not send the user to the YouTube app. Do **not** list
`googlevideo.com` — media is a subresource and never hits this
callback; naming it would trip Step 5’s `app/src` grep for
`googlevideo`. Subresources are unconstrained except we **do not**
add ad-host blocking.

Rejected: Media3 + extracted streams (ToS, parent plan, Step 5 halt
rule). Rejected: `YouTubePlayerView` from the old YouTube Android
Player API (deprecated, not IFrame). Rejected: Custom Tabs / external
browser.

### JS bridge whitelist (`YT-D21`)

Kotlin → JS (`evaluateJavascript` only):

| Method | When |
|---|---|
| `attachSession(generation)` | From `WebViewClient.onPageFinished`, after `attach()` has bumped generation and loaded the asset URL. Does **not** wait on `onPlayerEvent("ready")` |
| `loadVideo(id)` | After `Playing` entered, for the probed **video** id (playlists already expanded) |
| `pause()` | Expiry path, before destroy; also `onStop` while `Playing` |
| `stop()` | Same |
| `destroyPlayer()` | Destroys `YT.Player` inside the page |

There is **no** `loadPlaylist`. Playlist `AllowlistEntry` rows are
expanded with `playlistItems.list` + per-video probe; the player always
loads a video id.

JS → Kotlin: **one** `@JavascriptInterface` method,
`onPlayerEvent(json: String)`, with `Json` parsed in Kotlin to:

`ready | stateChange | error | ended`

`ready` is `YT.Player` ready *after* `loadVideo`, which itself
requires the session to already be attached. Waiting on `ready` to
call `attachSession` deadlocks the generation handshake.

The JSON **echoes `generation`**. Guard only against
`this.generation.get()`. `@JavascriptInterface` arrives on a **binder
thread**; marshal to main before attach, destroy, or engine calls.

States we care about: `playing`, `paused`, `buffering`, `ended`,
`unstarted`, `cued`. Ads are still `playing`/`buffering` as far as we
are concerned; the watch clock does not pause.

Rejected: a wide interface (`seekTo`, `setVolume`, `getDuration` for
app UI). We are not a second controller. Rejected: `addJavascriptInterface`
per event. Generation token (below) is checked on every event.

### Destroy-on-expiry (race-safe)

`PlayerSession` in `:app` (not `:core`). All attach/destroy/engine calls
on the **main thread**. `detachAndDestroy()` is idempotent.

```kotlin
class PlayerSession {
    private val generation = AtomicInteger(0)
    fun attach(webView: WebView) {
        val g = generation.incrementAndGet()
        // load https://appassets.androidplatform.net/…/youtube_player.html
        // WebViewClient.onPageFinished: evaluateJavascript("attachSession($g)")
        // Do not wait on onPlayerEvent("ready") — that is YT.Player
        // ready after loadVideo, which requires the session already attached.
    }
    fun detachAndDestroy() {           // main thread, idempotent
        generation.incrementAndGet()   // in-flight events die
        // 1. Flip phase/session state so Compose drops AndroidView
        // 2. (parent as? ViewGroup)?.removeView(webView)
        // 3. loadUrl("about:blank")
        // 4. webView.destroy()
        // 5. webView = null
        // Do not removeAllViews() as a substitute for detaching.
        // Do not destroy() while still attached.
    }
    fun onJsEvent(json: String) {      // binder thread
        val event = parse(json)        // includes generation
        mainHandler.post {
            if (event.generation != this.generation.get()) return@post
            ...
        }
    }
}
```

Teardown on **any** `PhaseChanged` whose `to` is not `Playing`
(includes `CycleReset`, rest, recovered-past-rest confirmation):

1. Flip phase/session state so Compose drops `AndroidView` from the tree
   (`if (phase == Playing && session.isAttached)` — not `View.GONE`)
2. `(parent as? ViewGroup)?.removeView(webView)`
3. `loadUrl("about:blank")`
4. `webView.destroy()`
5. Null the reference

If expiry fires during buffering or a preroll ad: `pause()` may no-op;
`destroy()` still runs. JS events whose echoed `generation` ≠
`this.generation.get()` are ignored so an in-flight
`onStateChange(playing)` cannot recreate playback.

`onStart` sequence: `engine.tick(deviceTime())` **first**. If the
resulting phase is not `Playing`, never attach a WebView.

`onStop` while `Playing`: `WebView.onPause()` / pause WebView timers so
Home does not leave YouTube audio playing with no UI. The watch clock
**keeps running**. `onStart` still ticks before re-attach.

### Autoplay policy (`YT-D23`)

WebView is constructed only after:

1. Continue watching click
2. Probe/expand allowlist to a playable **video** id
3. If none: show `NoPlayableItem`, stay `AwaitingConfirmation`
4. `confirmWatching(now)` succeeds (`Playing`)
5. Attach WebView, `loadVideo(id)`

Rest expiry, setup complete, process start in `AwaitingConfirmation` or
`Resting`: no constructor. Restore into `Playing` (mid-watch kill):
**do** reconstruct the WebView — the watch window is still open. That
is not rest-autoplay. Continue watching is the only door into a **new**
watch window. Start the next allowlist item from **0:00** (no
intra-video resume). Persist the allowlist cursor in **DataStore** next
to the timer (Room stays content-only):

```
allowlist_cursor_entry_id
allowlist_cursor_index
```

Cursor is `(entryId, playlistItemIndex)`. Skip walks **video ids**
inside the expanded playlist. Continue/restore does not always restart
item 1.

### Ads

YouTube may show ads inside the iframe. **Platform behavior.** We do
not strip, skip, or block ad hosts (that would break playback and ToS).
Watch elapsed continues during ads. Parent-facing: do not promise
ad-free. Step 5 records “ads can appear,” not “ads must appear.”

### Compose interop

Playback route:

```
Box(Modifier.fillMaxSize()) {
    if (phase == Playing && attached) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx -> session.createWebView(ctx) },
            onRelease = { /* do not destroy here on mere recomposition;
                             only PlayerSession.detachAndDestroy */ },
        )
    }
    if (phase == Playing) RemainingTimePill(remainingMs) // not focusable
}
```

Keep the WebView owned by `PlayerSession`, not by Compose’s
`onRelease` default (recomposition would tear down the player). Rest
and confirmation routes omit `AndroidView` entirely.

Overlays: remaining pill; Info key shows title/playlist for ~3s.
Do not draw pause/seek/skip on top of the iframe.

### D-pad and focus (`YT-D25`)

| Phase | Focus |
|---|---|
| Setup / picker / settings / confirmation / rest | Compose TV focus. One primary action. Immediate focus moves, no delay (brief). |
| `Playing` | WebView has focus so YouTube’s required controls work. Pill is not a focus target. |
| Transition to rest | After destroy, `requestFocus` on the rest root. WebView cannot remain focusable because it is gone. |

`BACK` in `Playing`: `Activity.moveTaskToBack` (watch clock keeps
running). Do not `finish()`. `BACK` in rest/confirmation: consume if it
would `finish` the task; the child must not dismiss rest by backing
out. `BACK` in setup: previous setup step.

`MEDIA_PLAY_PAUSE` during `Playing`: let WebView handle it (YouTube
pause). Timer still runs (Step 1 / 2). During rest: ignore media keys.

### Skip + expand

Probe fully **before** `confirmWatching` (Step 3 flags +
`nextPlayable` in `:core`). `nextPlayable(entries, cursor)` receives
already-expanded video ids; `:app` expands playlists via
`playlistItems.list`. The reducer does not fetch. Playlists, including
a selected subscription stored as `AllowlistKind.Playlist` /
`relatedPlaylists.uploads`: `playlistItems.list` in `:app`, then
per-video probe. Play the first playable **video id** with `loadVideo`.
If the probe returns `NoPlayableItem` (every candidate has a
**definitive** skip reason, or allowlist empty), do not enter `Playing`
and do not attach a WebView.

Transport error / 401 / `quotaExceeded` during probe: keep last-known
flags and **allow playback**. IFrame errors `2` / `5` / `100` / `101` /
`150` are the runtime net (2 = invalid id, 5 = HTML5 player error;
same skip-to-next as 100/101/150). Drop undocumented `105`.

After play has started, IFrame errors `2` / `5` / `100` / `101` / `150`
skip to the next playable **video id** in the same watch window (advance
`allowlist_cursor_index`). If none remain: `detachAndDestroy`, show a
`NoPlayableItem` slate, **stay in `Playing`** until the watch deadline,
then rest as usual. A race (probe said yes, YouTube then unlisted the
id) burns the window rather than lying about it.

Do **not** call `resetCycle` from playback errors. That command is a
PIN-gated parent action (Step 2). A child must not clear rest by
breaking playback.

Rejected: an `abandonWatching()` engine command that rewinds
`Playing` → `AwaitingConfirmation` on first-load failure. It duplicates
`resetCycle`, and wiring it to the child path punches a hole in the PIN
gate.

### Failure model

| Failure | Response |
|---|---|
| WebView missing / disabled on device | Step 5 platform blocker. Stop. No fallback player |
| IFrame `onError` 2/5/100/101/150 | Skip to next video id; `NoPlayableItem` slate if none left; timer keeps running if already `Playing` |
| Probe definitive negative (`embeddable=false`, private, age-restricted, region-blocked, missing `items`) | Mark skip; `NoPlayableItem` only if every candidate is a definitive skip (or allowlist empty) |
| Probe transport error / 401 / `quotaExceeded` | Keep last-known flags; allow playback; IFrame 2/5/100/101/150 are the runtime net |
| JS bridge exception | Log; treat as error skip; do not crash |
| Expiry during ad/buffer | `detachAndDestroy` idempotent, destroy order above |
| Compose recomposition | Must not `destroy()` the WebView |
| Network loss mid-play | YouTube’s own error inside iframe; timer keeps running |
| `shouldOverrideUrlLoading` to unknown host | Block (navigations only) |
| Home / `onStop` while `Playing` | `WebView.onPause()`; no YouTube audio without UI; watch clock keeps running |

### Important flows

**Continue watching.** Probe (expand playlists to video ids) →
`confirmWatching` → attach WebView → `loadVideo`. Pill ticks from
`TimerEngine.snapshot`.

**Watch expiry.** `tick` → `PhaseChanged(Playing, Resting)` →
`detachAndDestroy` → rest ring. No iframe process leftover
(`webview.chromium` going away is the point).

**Rest expiry.** `PhaseChanged(Resting, AwaitingConfirmation)` — session
already empty; compose confirmation.

**Process restore in `Playing`.** `tick` first; if still `Playing`,
attach new WebView, `loadVideo` on the cursor video id from 0:00.

**Home / `onStop` during `Playing`.** Pause WebView timers; no YouTube
audio without UI. Watch clock keeps running. `onStart` ticks before
re-attach.

---

## Decisions already made

- IFrame in WebView from the asset-loader https origin; narrow bridge
  (`loadVideo` only); destroy on any `PhaseChanged` whose `to` is not
  `Playing`; no player after rest; skip definitive-unlistable ids; D-pad
  TV UI; ads not stripped.
- `TimerEngine` is the phase authority (Step 2). This step is an
  adapter.

---

## Decisions this step must lock

| ID | Decision | Lock |
|---|---|---|
| **YT-D20** | Player | `WebViewAssetLoader` serves `assets/` from `https://appassets.androidplatform.net/`. `playerVars.origin` matches. `enablejsapi=1`. Local HTML + IFrame API. Reject `file://` and `loadDataWithBaseURL("https://www.youtube.com", …)`. |
| **YT-D21** | Bridge | Kotlin→JS: `attachSession(generation)`, `loadVideo`, `pause`, `stop`, `destroyPlayer`. No `loadPlaylist`. `attachSession` fires from `WebViewClient.onPageFinished` after `attach()` bumps generation and loads the asset URL; do not wait on `onPlayerEvent("ready")`. JS→Kotlin: one `onPlayerEvent` whose JSON echoes `generation`. Guard only `this.generation.get()`. `attach` bumps; `detachAndDestroy` bumps again. Binder thread marshals to main. |
| **YT-D22** | Expiry teardown | Generation-token `PlayerSession.detachAndDestroy()` on any `PhaseChanged` whose `to` is not `Playing`. Order: drop `AndroidView` → `removeView` from parent → `about:blank` → `destroy()` → null. Never `removeAllViews()` as detach; never `destroy()` while attached. |
| **YT-D23** | Autoplay | WebView constructed only after Continue watching + probe, or restore into still-valid `Playing`. |
| **YT-D24** | Ads | Allowed platform behavior; clock runs; we do not strip. |
| **YT-D25** | Focus | WebView focused only in `Playing`; rest/confirmation Compose-focused; `BACK` does not `finish` rest. |

---

## Scope in / Scope out

**In:** All eight screens at brief quality, WebView session, pill,
DataStore cursor, skip-by-video-id, D-pad, `onStart` tick-then-player,
`onStop` pause.

**Out:** New timer rules, new OAuth, ExoPlayer, download cache, CRT
shaders, MediaSession (do not publish one — it would offer a system
skip path; YouTube’s iframe already has controls).

---

## What this step retires or amends

| Item | Action |
|---|---|
| ExoPlayer / Media3 / `ForwardingPlayer` lockdown | Never added |
| `PlayerView` XML + Compose overlay from old §7 | Replaced: Compose owns the tree; WebView is an `AndroidView` *only* in `Playing` |
| Channel bug, no-signal, digit tune | Deleted as product surface |
| ARCHITECTURE “no MediaSession” | Keep the conclusion, new reason: we are not a local VOD player |

---

## Non-negotiables

1. **Rest expiry must not call `createWebView` or `loadVideo`.**
2. **`onStart` ticks before attach.** A late rest must not flash one
   iframe frame.
3. **Destroy is idempotent** and generation-gated.
4. **No `Intent` to YouTube** on error, click, or overlay.
5. **No googlevideo URL extraction.**
6. **Do not put app seek/pause chrome over the iframe.**
7. **Continue watching is disabled** when allowlist is empty or probe
   returns `NoPlayableItem`.

---

## Tests and verification

Automated here is thin (no SDK): none of the WebView path runs in
`./gradlew :core:test`. **Mandate** a pure cursor / skip list reducer in
`:core` (`nextPlayable(entries, cursor)` → next video id) so skip logic
is not TV-only. The reducer receives already-expanded video ids;
playlist expansion (`playlistItems.list`) is `:app` and is not fetched
inside `:core`. Tests cover walking those video ids.

On the SDK machine (Step 5): Robolectric/unit tests for
`shouldOverrideUrlLoading` host allowlist (includes
`appassets.androidplatform.net`); `PlayerSession` generation ignores
stale events (echoed generation vs `this.generation.get()`);
`detachAndDestroy` twice does not throw; destroy is not called while
attached.

Hardware: the Step 5 script. This step is not green until that script
runs on D6.

---

## Implementation build order

1. `nextPlayable` in `:core` + tests (already-expanded video ids; skip
   flags from Step 3). Playlist expansion (`playlistItems.list`) is
   `:app`; the reducer does not fetch. Not optional.
2. `PlayerSession` + HTML asset + bridge contract.
3. Wire `PhaseChanged` → destroy / confirmation.
4. Confirmation screen + Continue watching pipeline (probe then
   `confirmWatching` then attach).
5. Playback pill + info overlay; rest ring; `BACK` policy.
6. Visual pass on all eight screens (brief palette, 5% safe, focus
   borders).
7. Manual race: expiry while buffering (Step 5 will repeat on device).

---

## Open risks

| Risk | Mitigation |
|---|---|
| Android TV WebView cannot decode what the IFrame requests | Step 5 **platform blocker**. Stop. No download/extract/YouTube-app fallback |
| WebView eats all keys; rest cannot take focus after destroy | Destroy before composing rest; `requestFocus` on rest root |
| Compose `onRelease` destroys player on rotate/recompose | Session-owned WebView; `onRelease` is a no-op for destroy |
| YouTube changes IFrame API | After origin triage (Step 5), treat breakage as platform blocker, not a reason to extract streams. Do not pin a frozen iframe_api URL as a product strategy. |
| Ads burn watch time and feel unfair | Documented; clock is honest about “elapsed in this app” |
