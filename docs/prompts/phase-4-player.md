# Kickoff prompt — Phase 4 (Player)

Copy everything below the rule into a fresh session on this repo.

---

Implement **Phase 4 (Player)** of the Nostalgia Box delivery plan.

**Read first:** `docs/PLAN.md` (Phase P4), `docs/ARCHITECTURE.md` (**§1 in full**, §6.1–§6.6,
§2.6), `docs/PRD.md` (FR1–FR9).

**Branch:** develop on `claude/nostalgia-box-player-<suffix>`, commit, push. No PR.

**Prerequisites:** P1, P3 (or hand-sideloaded files to unblock early), and **D6 — a
named target device.** The switch-latency requirement is unverifiable without one.

> **This is the risk concentration of the whole project.** Everything before it is
> verifiable on a laptop. This phase can fail on hardware in a way that sends you back
> to a design decision. Measure early, not at the end.

## The invariant this phase exists to implement

> **Playback position is a pure function of the wall clock. It is never stored, never
> restored, and never advanced by us.**

Read `ARCHITECTURE.md` §1 before writing any code. If you find yourself persisting a
playback position anywhere, for any reason, you have broken the product.

## Decisions assumed

- **A1 accepted.** Timeline from the declared manifest; availability is a separate projection.
- **A5 accepted.** Media has a 2-second fixed GOP (C2).
- **A6 accepted.** No `MediaSession`, ever.

## Scope

Playback, tune-in, channel switching, control lockdown, drift correction.

**Out of scope:** the channel bug and every other overlay (P5). Log channel changes to
logcat for now.

## Build

- `TvPlayerController` — owns `ExoPlayer`; created in `onStart`, released in `onStop`
- Load a channel as a full playlist with `REPEAT_MODE_ALL` (FR3)
- Tune-in: `setMediaItems(items, ideal.index, ideal.offsetMs)` + `prepare()` (FR1, FR2, FR6)
- `setSeekParameters(SeekParameters.CLOSEST_SYNC)`
- Availability projection wired to P2's Room `Flow`; new files applied via
  `replaceMediaItems` **at item boundaries**
- Control lockdown (FR8, FR9) — see Non-negotiables
- Audio focus handled manually: duck to volume 0 on transient loss
- Key handling in `dispatchKeyEvent`:
  | Key | Action |
  |---|---|
  | `DPAD_UP` / `CHANNEL_UP` | previous channel, wrapping (FR5) |
  | `DPAD_DOWN` / `CHANNEL_DOWN` | next channel, wrapping (FR5) |
  | `0`–`9` | direct tune, 1s digit window |
  | `MEDIA_PLAY_PAUSE` / `PLAY` / `PAUSE` | toggle mute (FR8) |
  | `MEDIA_FF` / `REW` / `NEXT` / `PREVIOUS` | consumed, no effect (FR9) |
  | `DPAD_CENTER` long-press 2s | emit a settings event for P5 |
- Channel selection **debounced ~350ms** before the player loads
- Drift correction on `onMediaItemTransition`, a 30s ticker, `onStart`, and
  `ACTION_TIME_CHANGED` / `ACTION_TIMEZONE_CHANGED`
- Persist last-watched channel to DataStore (FR1)

## Non-negotiables

1. **Two player references, kept distinct.** The controller holds the **raw**
   `ExoPlayer` — it must seek freely to tune in. `PlayerView` receives a
   `ForwardingPlayer` with `COMMAND_SEEK_*`, `COMMAND_PLAY_PAUSE` and
   `COMMAND_SET_SPEED_AND_PITCH` removed and `setPlayWhenReady` no-op'd. Hand the
   wrapper to the controller and tune-in breaks; hand the raw player to the view and a
   seek control leaks. Also set `useController = false` and `setControllerAutoShow(false)`.
2. **No `MediaSession`.** Publishing one hands pause back to the system transport
   controls, the remote's dedicated media keys, and Assistant — from entirely outside
   your key handler. This is amendment A6 and it is not negotiable for a convenience.
3. **Never pause on audio focus loss.** Duck to silence. A frozen picture breaks the
   illusion far worse than a moment of silence does.
4. **Never store a playback position.** Not in DataStore, not in `SavedStateHandle`, not
   in a field that survives `onStop`. The clock is the only source. Storing one is how
   this product quietly becomes a video player.
5. **Drift correction needs a 2-second dead zone.** Correcting small drift produces a
   visible micro-seek every 30 seconds, which is worse than the drift it fixes.
6. **An unplayable file is removed from the *projection*, never from the *timeline*.**
   Removing it from the timeline changes `totalMs` and re-phases the channel — amendment
   A1's failure mode arriving through a side door.
7. **Debounce the selection, but not the channel change itself.** The user's channel
   number must update instantly on every keypress; only the *player load* waits for the
   selection to settle.
8. **Release the player in `onStop`.** TV boxes have very few hardware decoder
   instances. This is safe precisely because of the invariant — re-attaching is a fresh
   `resolve(now)`.

## Measurement

Instrument key-event → `onRenderedFirstFrame` and log it from day one of this phase.

**If p90 exceeds 1s on the D6 device, escalate in this order:**
1. Confirm the debounce is actually working
2. Confirm `CLOSEST_SYNC` is set
3. Confirm the media's GOP is really 2s (`ffprobe -select_streams v -show_frames`) —
   **two of these three are C2 encoding problems wearing a player-bug costume**
4. Only then consider the preloading fallback the `ChannelPlayer` interface exists for

## Exit criteria

- FR1, FR2, FR3, FR5, FR6, FR8, FR9 demonstrable on the D6 device
- **Switch away from a channel, wait a minute, switch back: it has moved on.** It did
  not resume where you left it
- Press play/pause: it mutes; the picture keeps moving
- Force-stop and relaunch: the channel is where wall-clock time says it should be
- p90 channel-switch latency recorded, with the number stated

## Report back

The measured p90 switch latency on the named device, whether the preloading fallback was
needed, and anything in `ARCHITECTURE.md` §6 that turned out wrong in contact with real
Media3. Also state explicitly that no playback position is persisted anywhere.
