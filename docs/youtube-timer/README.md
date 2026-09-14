# Timed YouTube TV — step plans

> **This Kotlin implementation is not the delivery track.** Product
> decisions (`YT-D*`) in these files remain law. `:core` / Compose /
> DataStore / Hilt locks do not. Follow
> [`docs/REACT_NATIVE_PLAN.md`](../REACT_NATIVE_PLAN.md) and
> [`docs/react-native/`](../react-native/README.md). Stop implementing
> Kotlin Steps 2–5.

Implementation-grade plans for the five steps in
[`docs/YOUTUBE_TIMER_PLAN.md`](../YOUTUBE_TIMER_PLAN.md). The parent file is the
source of the step list and the exit sentences. These files lock types, storage,
module placement, named errors, and rejected alternatives so an implementer can
execute one step from the file plus its **Read first** list.

Do not treat [`docs/PLAN.md`](../PLAN.md) or [`docs/prompts/`](../prompts/) as
the delivery track. Those belong to the retired broadcast/download product.
Keep them on disk; do not implement them.

## Steps

| # | Plan | Parent exit (sharpened in the file) |
|---|---|---|
| 1 | [Product and timer rules](01-product-and-timer-rules.md) | Timer behavior, enforcement limits, and acceptance criteria are documented without ambiguity |
| 2 | [Persistent timer and parent controls](02-persistent-timer-and-parent-controls.md) | Closing or restarting the app cannot reset either timer; PIN-gated settings stay gated |
| 3 | [YouTube connection and curation](03-youtube-connection-and-curation.md) | A parent can persist a playable allowlist from an account or from manual links |
| 4 | [Controlled Android TV playback](04-controlled-android-tv-playback.md) | Only curated IDs play; the WebView is gone when the watch deadline hits |
| 5 | [Verify policy, API, and device](05-verify-policy-api-device.md) | `:core` tests pass here; the full cycle works on the named TV, including restart and reboot |

Step 1 is documentation (PRD + architecture amendments). Steps 2–4 are code.
Step 5 is verification and does not add product surface.

## Retired vs retained

The hanging invariant in [`ARCHITECTURE.md` §1](../ARCHITECTURE.md) is
**retired**: playback position is no longer a pure function of the wall clock.
`TuneInResolver`, `LineupBuilder`, download/ExoPlayer, and the hosted manifest
are not the product.

**Retained** (still law):

- Two Gradle modules. `:core` is a plain Kotlin/JVM module. No `android.*` /
  `androidx.*`. [`ModuleBoundaryTest`](../../core/src/test/kotlin/com/nostalgiabox/core/ModuleBoundaryTest.kt)
  stays.
- This environment can run `./gradlew :core:test`. `:app` needs an Android SDK
  elsewhere. Step 5 must not pretend otherwise.
- `minSdk 24`, Leanback launcher, D-pad-only TV UI, 1920×1080, 5% safe area.
  PIN KDF is Mac-based PBKDF2 in `:core`; do not bump minSdk for
  `SecretKeyFactory` PBKDF2.
- Version catalog, pinned versions, Hilt in `:app`, OkHttp for HTTP.
- Honest residual risk: do not write enforcement the process cannot provide.

**Replaced in `:core`** (delete on Step 2, do not stretch):

`BroadcastClock`, `SystemBroadcastClock`, `Slot`, `Lineup`, `IdealSlot`,
`PlayableSlot`, `Channel`, `MediaFile`, `FileStatus`, `Manifest`,
`TuneInResolver`, `LineupBuilder`, `AvailabilityProjector`, `ChannelSelector`,
`ManifestDiffer`, `DriftCorrector`, `StorageBudget`, `MediaPaths`, and the
`manifest/` parser/validator/DTO/error types.

**Replaced in `:app` (never built past a black `TvActivity`):** WorkManager
media downloads, Room file rows, ExoPlayer/Media3, content-addressed `media/`
cache, channel bug, no-signal slate, hidden manifest settings.

**New hanging idea:** elapsed watch time is a function of a monotonic deadline
that pause, buffer, and backgrounding cannot move. Confirmation is the only
door into a **new** watch window (restore into still-valid `Playing` may
rebuild the player). Playlists persist as playlist ids (a selected
subscription is `relatedPlaylists.uploads`) and are expanded to video ids
at probe/play; the IFrame bridge is `loadVideo` only. See Step 1.

## Module map after the rewrite

```
:core   plain Kotlin/JVM
        timer/   TimeView · TimerPolicy · TimerEngine · named TimerError
        pin/     PinHasher · PinGate          (PBKDF2-HmacSHA256 via Mac("HmacSHA256"); minSdk 24 unchanged)
        allowlist/  AllowlistEntry · YoutubeUrlParser · nextPlayable

:app    Android
        time/    TimeView from elapsedRealtime + wall + BOOT_COUNT (Int?; missing ≠ 0)
        data/    DataStore (timer + PIN verifier + allowlist cursor) · Room (allowlist)
                 EncryptedSharedPreferences (OAuth tokens)
        youtube/ device-code OAuth · Data API · metadata cache
        player/  WebViewAssetLoader https origin (`appassets.androidplatform.net`)
                 + IFrame Player API · expand playlists to video ids · loadVideo only
                 · destroy-on-expiry
        ui/      Compose TV screens from the design brief
```

Keep `applicationId` `com.nostalgiabox.tv` and the `com.nostalgiabox.*`
packages. The display name is Timed YouTube TV. Renaming the id is out of
scope (it would fork any already-installed scaffold APK).

## How to use a step file

Same shape as the old kickoffs in `docs/prompts/`: read first, do not
re-litigate the locked decisions, implement in the listed order, stop at the
exit. Cross-links name dependencies (Step 4 consumes `TimerEngine` events from
Step 2; it does not re-specify the clock).
