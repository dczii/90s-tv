# Step 5 verification record — React Native track

**Date:** 2026-09-15  
**Branch:** `step-4-5-playback-verify`  
**D6 device (named):** Chromecast with Google TV (4K) — *hardware script not run in this session*

Hosts (RN-D10 / RN-D24):

| Role | Machine |
|---|---|
| Core Vitest host | This Mac (`darwin`, Cursor agent) |
| SDK / assemble host | This Mac (`~/Library/Android/sdk` present) |
| Hardware D6 | **Not executed this session** |

---

## Automated

| Check | Result | Notes |
|---|---|---|
| `pnpm --filter @littleplay/core test` | **PASS** | 64 tests; `nextPlayable` + TimerEngine 100% coverage; import boundary |
| `pnpm --filter tv test` | **PASS** | 19 tests: sqlite timer, allowlist, OAuth, authSession, client, PlayerSession generation gate, navigation host allowlist |
| `pnpm --filter tv typecheck` | **PASS** | `tsc --noEmit` |
| `pnpm --filter tv lint` | *not run* | Run on SDK host if desired |
| `./gradlew :app:assembleDebug` | **PASS** | 2026-09-15 on this Mac; APK at `apps/tv/android/app/build/outputs/apk/debug/app-debug.apk` |
| Grep gate | **PASS (with notes)** | See below |

### Grep gate notes

Searched `apps/tv`, `packages/core`, lockfiles for:
`vnd.youtube`, `ACTION_VIEW`, `googlevideo`, `yt-dlp`, `ExoPlayer`,
`DownloadManager`, `react-native-webview`, `expo-av`, `expo-video`,
`Linking.openURL`.

| Hit | Reason |
|---|---|
| `pnpm-lock.yaml` `react-native-webview` | Optional peer of `expo@57` only — **not** a project dependency |
| `allowlistRepo.test.ts` | Negative assertion string (must **not** match); comment added |
| `YoutubePlayerView.kt` comments | Explicit “do not use …” documentation of rejects |

No product dependency on forbidden players. No `googlevideo` navigation allowlist entry.

---

## §11 / PRD lines (code-level; hardware TBD)

| # | Criterion | Code / auto | Hardware |
|---|---|---|---|
| 1 | Leanback install | App config / prebuild | TBD |
| 2 | First-run wizard → confirmation, no player | Wizard + phase tree | TBD |
| 3 | Continue → loadVideo allowlisted id | `usePlaybackController` + `YoutubePlayerView` | TBD |
| 4 | Pause/Home do not extend remaining | TimerEngine + `onHostPause` | TBD |
| 5 | Watch expiry destroys WebView → rest | Phase leave → `detachAndDestroy` | TBD |
| 6 | Rest expiry → confirmation, no WebView | Mount rule RN-D21 | TBD |
| 7 | Kill/reboot restore | TimerEngine + restore attach if Playing | TBD |
| 8 | PIN matrix | Existing Step 2 gates | TBD |
| 9 | Skip / NoPlayableItem | `expandAndPickNext` + iframe skip codes | TBD |
| 10 | No media files / no vnd.youtube | Grep gate | TBD |

---

## Hardware script (YouTube-timer 05 items 1–11)

**Status: not run.** Needs D6 connected via `adb`.

| # | Item | Result |
|---|---|---|
| 1 | D-pad wizard→play→rest→confirm; focus at 3 m | — |
| 2 | OAuth device-code + kill/relaunch + disconnect | — |
| 3 | Manual links after sign-out | — |
| 4 | Rest complete: no player/audio 15s; Continue required | — |
| 5 | Ads: remaining drops | — |
| 6 | WebView codecs / origin triage | — |
| 7 | Expiry teardown (pause/buffer) | — |
| 8 | `am force-stop` mid-play/rest | — |
| 9 | Reboot mid-play/rest | — |
| 10 | Skip unplayable / playlist expand | — |
| 11 | Home 60s: remaining drops; no audio | — |

PIN matrix on device: **not run**.

---

## Platform blocker

None written. IFrame compatibility on D6 is **unknown** until hardware item 6.

**Halt rule stands:** if iframe fails origin triage, do **not** add ExoPlayer / `expo-video` / `react-native-webview` / download / YouTube-app Intent.

---

## Step 4 deliverables shipped in this branch

- `packages/core` `nextPlayable` + tests
- `apps/tv/modules/youtube-player` Expo native view (`WebViewAssetLoader` + IFrame HTML)
- JS `PlayerSession`, cursor kv, playlist expand, continue→confirm→attach
- Playing pill / rest ring / BACK → `moveTaskToBack` while Playing
- Destroy on leaving `Playing`
