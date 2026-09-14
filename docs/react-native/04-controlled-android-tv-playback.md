# Step 4 — Controlled Android TV playback

**Parent:** [React Native Five-Step Plan](../REACT_NATIVE_PLAN.md) §4
**Status:** blocked on Step 2 (`TimerEngine` events) and Step 3 (allowlist
IDs + playability probe).
**Produces:** Expo native `YoutubePlayerView` (WebViewAssetLoader + IFrame),
destroy-on-expiry, eight design-brief screens, D-pad behavior. No
`react-native-webview`, no ExoPlayer, no `expo-av` / `expo-video` YouTube
hack, no `vnd.youtube` intent.

---

## Goal

Play only allowlisted YouTube IDs inside this process, and guarantee the
player object does not exist outside `Playing`. Watch expiry pauses,
destroys the WebView, and shows rest. Rest expiry shows confirmation
**without** constructing a WebView.

Bridge whitelist, destroy order, autoplay policy, ads, skip/expand, and
BACK rules **are not re-specified**. They are
[`youtube-timer/04`](../youtube-timer/04-controlled-android-tv-playback.md)
(`YT-D20`–`YT-D25`). This file maps them onto a Fabric native view and a
phase-driven React tree.

---

## Exit criterion

Copied from the parent plan and sharpened:

- [ ] Official YouTube IFrame Player API in an Android WebView hosted by
      `YoutubePlayerView`. Page served from
      `https://appassets.androidplatform.net/` via `WebViewAssetLoader`.
      No `file:///`, no `loadDataWithBaseURL("https://www.youtube.com")`,
      no `react-native-webview`. No extracted googlevideo URLs, no Intent
      to the YouTube app.
- [ ] Native→JS bridge is the YT-D21 whitelist and nothing else.
      Playlists expanded to video ids; `loadVideo` only.
- [ ] On any `PhaseChanged` whose `to` is not `Playing`: the destroy order
      below, main thread, idempotent. Race-safe if buffering or an ad is
      playing.
- [ ] On rest complete: `AwaitingConfirmation`, no native player view in
      the tree, no `loadVideo`, no autoplay.
- [ ] All eight brief screens are D-pad-first at 1920×1080 with 5% safe
      area.
- [ ] Definitive probe negatives skipped; `NoPlayableItem` on confirmation
      without `confirmWatching`.

---

## Read first

- [01](01-stack-and-module-map.md), [02](02-persistent-timer-and-parent-controls.md),
  [03](03-youtube-connection-and-curation.md)
- [youtube-timer/04](../youtube-timer/04-controlled-android-tv-playback.md)
- [DESIGN_BRIEF.md](../../designs/DESIGN_BRIEF.md)
- YouTube IFrame Player API (`YT.Player`, events, error codes)
- Step 2 non-negotiable: resume → `tick` → attach only if still `Playing`

---

## Product / user-visible outcome

Same eight screens as YouTube-timer 04. Playback is full-bleed 16:9 native
WebView, remaining-time pill (amber in last 60s), Info overlay, **no** app
chrome over required YouTube controls. Rest: player **absent**.

---

## Technical design

### Why not `react-native-webview`

Stock RN WebView does not expose `WebViewAssetLoader` /
`shouldInterceptRequest`. Loading the local HTML as `file://` or as
`source={{ html }}` is exactly what YT-D20 rejects (opaque origin; IFrame
API handshake fails or becomes ToS-adjacent). A 2020-era PR to add
AssetLoader did not become a supported, default-on API we can bet this
product on.

Lock: **`apps/tv/modules/youtube-player`** — an Expo native **view**
wrapping `android.webkit.WebView` + `androidx.webkit.WebViewAssetLoader`.

### Origin (YT-D20)

Asset loader serves `apps/tv/assets/youtube_player.html` (copied into
Android `assets/` by the module / Gradle). Load:

`https://appassets.androidplatform.net/assets/youtube_player.html`

`playerVars.origin` matches that origin. `enablejsapi=1`.

`shouldOverrideUrlLoading` is navigations only. Allow
`appassets.androidplatform.net`, `youtube.com`, `youtu.be`, `google.com`,
`ytimg.com`, `gstatic.com`. **Block and do not `ACTION_VIEW` anything
else.** Do not list `googlevideo.com` (Step 5 grep). Do not add ad-host
blocking.

### JS bridge whitelist (YT-D21)

Kotlin/native → page (`evaluateJavascript` only):

`attachSession(generation)`, `loadVideo(id)`, `pause()`, `stop()`,
`destroyPlayer()`.

No `loadPlaylist`.

Page → native: one `@JavascriptInterface` `onPlayerEvent(json: String)`.
JSON echoes `generation`. Native posts to JS on the main thread. JS
`PlayerSession` ignores stale generation.

`attachSession` fires from `WebViewClient.onPageFinished` after native
`attach()` bumps generation and loads the asset URL. Do **not** wait on
`onPlayerEvent("ready")`.

### `PlayerSession` (JS) + native view

```tsx
// Mount ONLY when snapshot.phase === 'Playing' && sessionWantsAttach
<YoutubePlayerView
  ref={session.nativeRef}
  style={{ flex: 1 }}
  onPlayerEvent={session.onNativeEvent}
/>
```

JS `PlayerSession`:

- Owns `generation` (or trusts native — pick **native as source**, JS
  mirrors it from events; do not keep two incrementers).
- `attach()` / `loadVideo(id)` / `detachAndDestroy()` are imperative
  view methods (`ExpoView` `AsyncFunction` on the view).
- React `onUnmount` of the view **must not** be the only destroy path,
  but native `onDropViewInstance` **must** call `detachAndDestroy` if
  still attached (safety for Fast Refresh / unexpected unmount).
- The product destroy path is: `PhaseChanged` to ≠ `Playing` →
  `detachAndDestroy()` → then setState so the component unmounts.

Destroy order (native, main thread, idempotent) — copy YT-D22:

1. Bump generation (in-flight events die)
2. JS flips phase so the view unmounts **after** this call returns, or
   native removes itself from the parent
3. `removeView` from parent if still attached
4. `loadUrl("about:blank")`
5. `webView.destroy()`
6. Null the reference

Never `destroy()` while still attached. Never treat RN
`collapsable={false}` as a substitute for this order.

If expiry fires during buffering or a preroll ad: `pause()` may no-op;
`destroy()` still runs.

`onStop` / Activity pause while `Playing`: `WebView.onPause()` so Home
does not leave YouTube audio playing with no UI. Watch clock **keeps
running**. Resume ticks before re-attach.

### Autoplay (YT-D23)

Native view is mounted only after:

1. Continue watching press
2. Probe/expand to a playable **video** id
3. If none: `NoPlayableItem`, stay `AwaitingConfirmation`
4. `confirmWatching(now)` succeeds (`Playing`)
5. Mount view, `loadVideo(id)`

Rest expiry, setup complete, process start in `AwaitingConfirmation` or
`Resting`: no mount. Restore into still-valid `Playing`: **do** mount
and `loadVideo` on the cursor id from 0:00. Continue watching is the
only door into a **new** watch window.

Cursor in sqlite `kv`: `allowlist_cursor_entry_id`,
`allowlist_cursor_index`. `nextPlayable` lives in `packages/core` and
receives already-expanded video ids (playlist expansion is `apps/tv`
`playlistItems.list`).

### Ads (YT-D24)

Do not strip. Clock runs. Do not promise ad-free.

### Focus and BACK (YT-D25)

| Phase | Focus |
|---|---|
| Setup / picker / settings / confirmation / rest | RN `Pressable` / `TVFocusGuideView`. One primary. Immediate. `hasTVPreferredFocus` on the primary. |
| `Playing` | Native WebView has focus (YouTube controls). Pill `focusable={false}`. |
| Transition to rest | After destroy, preferred focus on the rest root. |

`BackHandler`:

- `Playing`: native `moveTaskToBack` (module method). Watch clock runs.
  Do not `BackHandler.exitApp()`.
- Rest / confirmation: `return true` (consume). Child must not dismiss
  rest.
- Setup: previous step.

`MEDIA_PLAY_PAUSE` during `Playing`: let WebView handle it. Timer still
runs. During rest: ignore.

Rejected: React Navigation stack. A default BACK pop is a product bug.

### Skip + expand

Port 04. Probe before `confirmWatching`. IFrame errors `2` / `5` /
`100` / `101` / `150` skip to next video id (not `105`). If none remain
after play started: destroy view, `NoPlayableItem` slate, **stay in
`Playing`** until the watch deadline. Do **not** call `resetCycle` from
playback errors.

### Overlay

Remaining pill is RN, not inside the WebView, not focusable. Info key
(`onTVNav` / `TVEventHandler` info) shows title ~3s. Do not draw
pause/seek/skip on top of the iframe.

### Failure model

Port 04, plus:

| Failure | Response |
|---|---|
| Fabric view fails to create WebView | Step 5 platform blocker. Stop. No `expo-video` fallback |
| Fast Refresh remounts the view mid-play | Native `onDropViewInstance` destroys; JS must not auto-`loadVideo` unless still `Playing` after tick |
| `react-native-webview` added as a “temporary” player | Fail the Step 5 grep gate |

---

## Decisions already made

- YT-D20–D25. RN-D8 (custom player view). TimerEngine is phase authority.

---

## Decisions this step must lock

| ID | Decision | Lock |
|---|---|---|
| **RN-D20** | Player component | Expo native view `YoutubePlayerView`. Forbidden: `react-native-webview`, `expo-web-browser`, `Linking.openURL` to YouTube. |
| **RN-D21** | Mount rule | `{phase === 'Playing' && attached && <YoutubePlayerView />}` — not `display: 'none'`, not `opacity: 0`. |
| **RN-D22** | Generation | Native increments; events echo it; JS drops mismatch. |
| **RN-D23** | HTML asset | One `youtube_player.html` in the native module assets; CNG must keep it. |

---

## Scope in / Scope out

**In:** Native player module, HTML asset, PlayerSession, pill, cursor kv,
skip-by-video-id, D-pad, resume tick-then-player, visual pass on eight
screens, `BackHandler` policy.

**Out:** New timer rules, new OAuth, ExoPlayer, `expo-video` as YouTube,
download cache, CRT shaders, MediaSession.

---

## What this step retires or amends

| Item | Action |
|---|---|
| Kotlin `PlayerSession` | Not built; JS+native equivalent |
| Compose `AndroidView` notes | Replaced by RN mount rule RN-D21 |
| Channel bug / digit tune | Stay gone |

---

## Non-negotiables

1. **Rest expiry must not mount `YoutubePlayerView` or call `loadVideo`.**
2. **Resume ticks before attach.**
3. **Destroy is idempotent** and generation-gated.
4. **No Intent / Linking to YouTube.**
5. **No googlevideo URL extraction.**
6. **Do not put app seek/pause chrome over the iframe.**
7. **Continue watching is disabled** when allowlist is empty or probe
   returns `NoPlayableItem`.
8. **Do not add `react-native-webview` to `package.json`.**

---

## Tests and verification

`packages/core`: `nextPlayable` tests (already-expanded ids). Mandatory.

SDK machine (Step 5): host allowlist for navigations; generation ignores
stale events; `detachAndDestroy` twice does not throw; destroy is not
called while attached.

Hardware: YouTube-timer 05 script. This step is not green until that
script runs on D6.

---

## Implementation build order

1. `nextPlayable` in core + tests (if not already done in Step 3).
2. `youtube-player` native module + HTML + bridge contract.
3. JS `PlayerSession`; wire `PhaseChanged` → destroy.
4. Confirmation + Continue watching pipeline (probe → confirm → attach).
5. Pill, info overlay, rest ring, BACK policy.
6. Visual pass (brief palette, 5% safe, focus borders).
7. Manual race: expiry while buffering.

---

## Open risks

| Risk | Mitigation |
|---|---|
| Android TV WebView cannot decode the IFrame | Step 5 platform blocker. Halt. No fallback player |
| Fabric view focus vs YouTube iframe | Native `requestFocus` on WebView when Playing; rest `hasTVPreferredFocus` after destroy |
| CNG `--clean` drops module assets | Module owns the HTML; document in the local plugin |
| YouTube changes IFrame API | Origin triage then blocker; do not extract streams |
| Ads burn watch time | Documented; clock is honest |
