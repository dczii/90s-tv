# LittlePlay — React Native step plans

Implementation-grade plans for the five steps in
[`docs/REACT_NATIVE_PLAN.md`](../REACT_NATIVE_PLAN.md). The parent file is the
source of the step list and the exit sentences. These files lock the RN stack,
native seams, TypeScript types, storage, named errors, and rejected
alternatives.

**Product law is not redefined here.** Timer phases, confirmation, dual-clock
recovery, PIN lockout, allowlist skip policy, IFrame bridge, and green
criteria are `YT-D1`–`YT-D29` in [`docs/youtube-timer/`](../youtube-timer/README.md).
Read those files. This folder only answers “how, in React Native.”

Do not treat [`docs/PLAN.md`](../PLAN.md), [`docs/prompts/`](../prompts/), or
the Kotlin [`docs/youtube-timer/`](../youtube-timer/README.md) *implementation*
locks (`:core` Kotlin, DataStore, Room, Hilt, Compose) as the delivery track
once this track is chosen. Keep them on disk as product reference and as the
abandoned Kotlin rewrite.

## Pick one track

`applicationId` stays `com.littleplay.tv`. Shipping both APKs is a fork.
If this track is chosen, stop implementing Kotlin Steps 2–5. Kotlin Step 1’s
*product* rewrite of the PRD is still required; its *architecture* rewrite is
replaced by [01](01-stack-and-module-map.md).

## Steps

| # | Plan | Parent exit (sharpened in the file) |
|---|---|---|
| 1 | [Stack and module map](01-stack-and-module-map.md) | Product rules inherited; RN architecture and repo layout locked; Expo TV scaffold installs |
| 2 | [Persistent timer and parent controls](02-persistent-timer-and-parent-controls.md) | Closing or restarting cannot reset either timer; PIN-gated settings stay gated |
| 3 | [YouTube connection and curation](03-youtube-connection-and-curation.md) | A parent can persist a playable allowlist from an account or from manual links |
| 4 | [Controlled Android TV playback](04-controlled-android-tv-playback.md) | Only curated IDs play; the WebView is gone when the watch deadline hits |
| 5 | [Verify policy, API, and device](05-verify-policy-api-device.md) | `packages/core` tests pass here; the full cycle works on the named TV |

Step 1 is documentation plus the installable TV shell. Steps 2–4 are code.
Step 5 is verification and does not add product surface.

## Inherited hanging idea

> Elapsed watch time advances with a monotonic clock. Pause, buffer, and
> backgrounding cannot extend the watch window. The player exists only in
> `Playing`, and `Playing` is entered only by Continue watching.

Deadlines persist across process death and TV reboot. Rest expiry does not
construct a player. The official YouTube app, uninstall, data-clear, and
clock rollback remain residual risks.

## Module map

```
packages/core          TypeScript, Node-testable
                       no react-native, no expo, no react
                       timer/   TimeView · TimerPolicy · TimerEngine
                       pin/     PinHasher · PinGate   (@noble/hashes PBKDF2-SHA256)
                       allowlist/  AllowlistEntry · YoutubeUrlParser · nextPlayable

apps/tv                Expo (CNG) + react-native-tvos
                       modules/device-time        elapsedRealtime + wall + BOOT_COUNT
                       modules/android-identity   package name + signing cert SHA-1
                       modules/youtube-player     WebViewAssetLoader + IFrame host
                       src/time/                  deviceTime() adapter
                       src/data/                  expo-sqlite kv + allowlist + catalog
                       src/secure/                expo-secure-store tokens
                       src/youtube/               device-code OAuth + Data API
                       src/player/                JS PlayerSession wrapping native view
                       src/ui/                    phase-driven screens (no stack router)
```

Keep `applicationId` `com.littleplay.tv`. Display name LittlePlay.

## Kotlin → RN mapping

| Kotlin lock | React Native lock |
|---|---|
| `:core` Kotlin/JVM, `ModuleBoundaryTest` | `packages/core` TS, ESLint/dependency-cruiser: no `react-native` |
| `./gradlew :core:test` | `npm test -w packages/core` (Vitest) |
| Compose TV + Leanback Activity | `react-native-tvos` Pressable / `TVFocusGuideView` |
| Preferences DataStore | `expo-sqlite` table `kv` |
| Room allowlist | `expo-sqlite` table `allowlist_entries` |
| EncryptedSharedPreferences | `expo-secure-store` |
| Hilt | none; composition root in `src/app/container.ts` |
| OkHttp + `X-Android-*` headers | `fetch` + `AndroidIdentity` native module |
| `WebViewAssetLoader` in `:app` | Expo native view `YoutubePlayerView` (not `react-native-webview`) |
| `Mac("HmacSHA256")` PBKDF2, sync | `@noble/hashes` PBKDF2-SHA256, async in core |
| `onStart` → tick → player | `AppState` + native Activity resume event; JS must tick before `attach` |
| Gradle `:app` needs SDK | `npx expo run:android` needs SDK; core tests do not |

## Existing tree

The Gradle `:core` / `:app` broadcast scaffold stays on disk until Step 2 has
a green Vitest suite. Do not port `TuneInResolver`, `LineupBuilder`, or
ExoPlayer. Do not share a process with the Kotlin `TvActivity`.

## How to use a step file

Same shape as [`docs/youtube-timer/`](../youtube-timer/README.md): read first,
do not re-litigate locked `YT-D*` or `RN-D*` decisions, implement in the
listed order, stop at the exit. Cross-links name dependencies (Step 4 consumes
`TimerEngine` events from Step 2; it does not re-specify the clock).
