# Step 1 — Product and timer rules

**Parent:** [Timed YouTube TV — Five-Step Plan](../YOUTUBE_TIMER_PLAN.md) §1
**Status:** product text landed via the React Native track’s Step 1
(`docs/PRD.md` rewritten; `docs/ARCHITECTURE.md` is Expo + `packages/core`,
not `:core` / Compose). This file remains product law. Do not implement
Kotlin/Gradle from it.
**Blocked on:** nothing. This is the first step.
**Produces:** rewritten product rules in `docs/PRD.md` and `docs/ARCHITECTURE.md`
(amendments applied when this step is executed), plus a parent-facing
enforcement paragraph reused on Welcome and Parent settings.

---

## Goal

Replace the broadcast/download product with a parent-configured YouTube timer
for Android TV, in writing precise enough that Steps 2–5 do not invent policy.
The child watches curated YouTube inside this app for a bounded window, then
sits on a rest screen until an explicit **Continue watching** press. The old
invariant — playback position is a pure function of the wall clock — is
retired, not adapted.

---

## Exit criterion

Copied from the parent plan and sharpened:

- [ ] `docs/PRD.md` describes Timed YouTube TV (parent + child on Android TV),
      not a technical operator hosting a manifest. Old FR1–FR15 and §11 are
      gone; new numbered FRs and a new §11 exist.
- [ ] `docs/ARCHITECTURE.md` §1 states the new hanging idea (monotonic watch
      deadline; confirmation is the only player door). §3 lists the new
      `:core` / `:app` map. Broadcast types are named as deleted, not
      deprecated-in-place.
- [ ] Lifecycle, session-start, rest-anchoring, defaults/ranges, and
      enforcement limits below are copied into those docs without restating
      “TBD”.
- [ ] `docs/YOUTUBE_TIMER_PLAN.md` still owns the five-step list; this folder
      owns the implementation locks.

Checkable: a reader who has never seen the broadcast PRD can implement Step 2
from the new architecture plus [02](02-persistent-timer-and-parent-controls.md).

---

## Read first

- [YOUTUBE_TIMER_PLAN.md](../YOUTUBE_TIMER_PLAN.md)
- [PRD.md](../PRD.md) (the document being replaced)
- [ARCHITECTURE.md](../ARCHITECTURE.md) (the document being replaced)
- [DESIGN_BRIEF.md](../../designs/DESIGN_BRIEF.md)
- [PLAN.md](../PLAN.md) and [prompts/README.md](../prompts/README.md) (tone only)
- `:core` types in `core/src/main/kotlin/com/nostalgiabox/core/model/Domain.kt`
  (the delete list)

Do not read `designs/*.pen`. Do not implement timer code in this step.

---

## Product / user-visible outcome

This step owns no shipping screens. It writes the copy and rules the screens
obey. From the design brief, the product surface after later steps is:

| Brief screen | When it appears |
|---|---|
| Welcome / Parent setup | First launch; `TimerPhase.Setup` |
| Timer setup | First launch; durations + PIN create |
| Connect YouTube | First-run wizard (not PIN-gated) or Parent settings (PIN-gated) |
| Choose allowed content | First-run wizard (not PIN-gated) or Parent settings (PIN-gated) |
| Ready / Continue watching | `AwaitingConfirmation` — every rest, and the first launch after setup |
| Playback | `Playing` only, and only after Continue watching or restored mid-watch into still-valid `Playing` |
| Rest timer | `Resting` — player absent |
| Parent settings | PIN-gated; available from rest and from confirmation as a secondary action |

Visual direction stays the brief: near-black navy, warm off-white, coral
primary, amber only for time warnings. D-pad, 1920×1080, 5% safe area.

---

## Technical design

### New hanging idea

> **Elapsed watch time advances with a monotonic clock. Pause, buffer, and
> backgrounding cannot extend the watch window. The player exists only in
> `Playing`, and `Playing` is entered only by Continue watching.**

Deadlines persist across process death and TV reboot. Rest expiry does not
construct a player. The official YouTube app, uninstall, data-clear, and
clock rollback are outside the process and are named residual risks, not
bugs.

### Target user

**Parent + child on one Android TV.** The parent sets a PIN, durations, and
an allowlist. The child uses Continue watching, the YouTube iframe controls,
and nothing that changes policy. This replaces PRD §3’s technical operator
who hosts a manifest URL.

### Phase machine

```kotlin
enum class TimerPhase {
    Setup,                 // first run: no PIN, no policy
    AwaitingConfirmation,  // door to the player; player must not exist
    Playing,               // watch window open; player may exist
    Resting,               // watch expired; player must not exist
}
```

Legal transitions (all others are `TimerError.IllegalTransition`):

```
Setup --completeSetup--> AwaitingConfirmation
AwaitingConfirmation --confirmWatching--> Playing
Playing --watch deadline--> Resting
Resting --rest deadline--> AwaitingConfirmation
Playing|Resting|AwaitingConfirmation --resetCycle--> AwaitingConfirmation
Playing --recovered past watch+rest--> AwaitingConfirmation
```

`completeSetup` is the only path out of `Setup`. There is no path that
creates a player. `tick` is the only path that expires a phase. Commands
never autoplay. Recovery that is already past both the watch and rest
deadlines may collapse through `Resting` and emit one `PhaseChanged`
(`Playing` → `AwaitingConfirmation`) rather than a visible rest frame.

`Setup` ends when a PIN verifier and a `TimerPolicy` are stored. The
allowlist may still be empty: Continue watching is disabled until Step 3
persists at least one entry. That is UI gating, not a fifth phase.

### Session time (when the watch clock starts)

The watch clock starts in `confirmWatching`, at that `TimeView`. It does
**not** start on app launch, on leaving Setup, on rest expiry, or on
composing the confirmation screen.

`remainingMs` is `0` in `Setup` and `AwaitingConfirmation`. In `Playing` it
is time until the watch deadline; in `Resting`, until the rest deadline.

Confirmation copy (“15 minutes available”) is always the configured watch
duration, a fresh window, not leftover time from a killed session. Leftover
time exists only if we restore into `Playing` (process death mid-watch).

### Rest anchoring

Rest starts at the **watch-expiry instant**, even if the process is dead
when that instant passes.

On recover / `tick`:

1. If `phase == Playing` and `now` is past the watch deadline, rest deadline
   = `watchDeadline + restDuration` (deadlines in the same clock domain —
   see Step 2). Do not use restore-`now` as the rest start.
2. If that rest deadline is also already past, go to `AwaitingConfirmation`.
   Do not skip confirmation. Do not open a player.
3. If `phase == Resting` and `now` is past the rest deadline, go to
   `AwaitingConfirmation` with no player.

A kill mid-transition cannot grant extra watch time (deadline already
written) and cannot shorten rest by “starting rest when we next launch.”

### Confirmation

Required after every rest, including the first launch after setup. Required
after a recovery that skipped a fully elapsed rest. Never skipped because
the allowlist is “ready,” because the app just updated, or because the
previous session ended cleanly.

### Defaults and ranges

| | Default | Min | Max | Step |
|---|---|---|---|---|
| Watch | 15 min | 5 min | 60 min | 5 min |
| Rest | 30 min | 5 min | 180 min | 5 min |

Values are stored as milliseconds. `TimerPolicy` validation rejects anything
off the step grid (`PolicyOutOfRange`). No rule that rest must exceed watch.

### Parent-facing enforcement copy (verbatim)

> This app limits watching only while you use it. It cannot block the
> YouTube app, and it cannot stop someone from uninstalling this app,
> clearing its data, or changing the TV clock.

Welcome shows this as the small note. Parent settings shows it again under
the policy summary. Do not soften it.

### Residual risks (product, not bugs)

| Risk | Honest status |
|---|---|
| Child opens the official YouTube app | Out of process. Not solvable here. |
| Uninstall / disable this app | Out of process. |
| Clear app data | Wipes PIN, policy, deadlines, allowlist, tokens. Next launch is Setup. |
| Wall-clock rollback after a reboot | Accepted; named in the parent plan. In-boot expiry does not use wall clock. |
| Offline cracking of a 4-digit PIN verifier | Accepted. Threat model is the child with the remote, not `adb pull`. Lockout covers the remote. |

### `:core` vs `:app`

Timer policy + phase machine live in `:core`. Android adapters (DataStore,
Keystore, WebView, OAuth UI, `SystemClock`, `BOOT_COUNT`) live in `:app`.
Step 1 writes this boundary into `ARCHITECTURE.md` §3. Step 2 implements it.

### Failure model (product level)

| Failure | Response |
|---|---|
| Empty allowlist after setup | Stay on confirmation; Continue watching disabled; no clock |
| Watch expires during buffer/pause/background | Rest. Player destroyed if it existed. Remaining is not credited back |
| Process death in `Playing` | Restore `Playing` if the watch deadline is still in the future; else rest-anchor as above |
| Reboot in `Playing` or `Resting` | Restore from the wall-clock deadline (Step 2). Clock rollback is residual |
| Parent changes durations | Step 2 (`YT-D12`). Not a product mystery: elapsed in the current phase is preserved |

### Important flows

**First run.** Welcome → Timer setup (defaults 15/30, PIN create) → Save
(`completeSetup`, phase is now `AwaitingConfirmation`) → Connect YouTube or
“Use links instead” → Choose content → Ready. Wizard Connect and content
picker are **not** PIN-gated. Continue watching stays disabled until the
allowlist is non-empty. Continue watching → `Playing`.

**Everyday.** Launch → recover phase. If `Playing`, rebuild player with
remaining time. If `Resting`, rest UI, no player. If
`AwaitingConfirmation`, confirmation, no player. Never Setup unless data
was cleared.

**Watch expiry.** `tick` → `Resting` → destroy player → rest countdown.
Rest expiry → `AwaitingConfirmation` → still no player.

---

## Decisions already made

- Lifecycle is exactly `Setup → AwaitingConfirmation → Playing → Resting →
  AwaitingConfirmation`.
- Watch elapsed continues while paused, buffering, or backgrounded.
- Deadlines persist across process death and TV reboot.
- Rest expiry must not construct or autoplay the player.
- This app does not stop the official YouTube app, uninstall, data-clear, or
  clock tampering.
- IFrame Player API in a WebView; never download/extract streams; never
  launch the official YouTube app.
- `:core` stays JVM-only. `ModuleBoundaryTest` remains law.
- Replace domain types rather than stretching `Lineup` / `Slot` into a timer
  (see [README.md](README.md) “Replaced in `:core`”).
- Display name Timed YouTube TV; keep `applicationId` `com.nostalgiabox.tv`.

---

## Decisions this step must lock

| ID | Decision | Lock |
|---|---|---|
| **YT-D1** | Phase enum and legal transitions | The four phases and the arrows above. No `Paused` phase — pause is a player state inside `Playing`. |
| **YT-D2** | When session time starts | On `confirmWatching`, not on Setup and not on rest expiry. |
| **YT-D3** | Rest start if the app is killed at expiry | Rest deadline = watch-expiry instant + rest duration. Recovery may skip the rest *UI* if rest has also elapsed, but it still lands on confirmation. |
| **YT-D4** | Confirmation after every rest, including first launch after setup | Required. No autoplay path. |
| **YT-D5** | Defaults and ranges | 15/30 default; watch 5–60 step 5; rest 5–180 step 5; milliseconds in storage. |
| **YT-D6** | Target user | Parent + child on Android TV. The manifest operator is gone. |
| **YT-D7** | Enforcement copy | The verbatim paragraph above. Residual-risk table is architecture, not marketing. |

Rejected: a `Paused` phase that stops the watch clock — that *is* the
extension bug this product exists to prevent. Rejected: starting the watch
clock when Setup completes — first-run curation would steal the first
window. Rejected: stretching `BroadcastClock` / `Lineup` into timer types —
the modulo timeline answers a question this product does not ask.

---

## Scope in / Scope out

**In:** Rewrite `docs/PRD.md` and `docs/ARCHITECTURE.md` to this product.
Point `docs/YOUTUBE_TIMER_PLAN.md` at this folder (already started). Name
every `:core` type as delete / keep. Record D6 as “still a named TV SKU,
now for WebView/IFrame, not channel-switch latency.”

**Out:** Kotlin, Gradle, design `.pen` files, PIN hashing, DataStore, OAuth,
WebView, tests. Deleting `:core` broadcast types is Step 2’s first build
item, done against the list this step publishes. `docs/PLAN.md` and
`docs/prompts/*` are left in place; the new PRD’s overview says they are
historical.

---

## What this step retires or amends

| Document / type | Action |
|---|---|
| PRD §1–§4, §7–§11, §13 | Rewrite. New FRs: timer phases, PIN, allowlist, IFrame-only playback, confirmation door. New §11 is Step 5’s checklist. |
| PRD §5–§6 (manifest, 5 channels, download) | Delete. No media cache of YouTube. Allowlist is IDs + metadata. |
| PRD §9 ExoPlayer / WorkManager | Replace with WebView IFrame + OkHttp Data API. |
| ARCHITECTURE §1 broadcast invariant | Replace with the hanging idea above. |
| ARCHITECTURE §2 A1–A8 (timeline vs download, sha256, Range, GOP, MediaSession, boot launch) | Retire. They answer download-broadcast problems. |
| ARCHITECTURE §3–§8 | Replace module guts, data, player, UI state machine. Keep two-module split, minSdk 24, env note (§13). |
| ARCHITECTURE §9 Cross-cutting | Rewrite for this product (Leanback, Hilt, version catalog). Historical broadcast notes do not survive as law. |
| ARCHITECTURE §10 Build order | **Rewrite.** The P0–P6 download/ExoPlayer sequence must not survive as the delivery track; this folder is. |
| ARCHITECTURE §11 PRD open questions | Rewrite against the new PRD; old broadcast answers are historical. |
| ARCHITECTURE §12 Known risks | Rewrite; residual risks are the Step 1 table (YouTube app, uninstall, data-clear, clock rollback), not five-channel storage. |
| PLAN.md P0–P7, C1–C3, prompts | Historical. Not the delivery track. |
| `Domain.kt` broadcast types | **Delete in Step 2.** Do not freeze and wrap. |
| `TuneInResolver`, `LineupBuilder`, `AvailabilityProjector`, `ChannelSelector`, `ManifestDiffer`, `DriftCorrector`, `StorageBudget`, `MediaPaths`, `BroadcastClock`, `manifest/*` | **Delete in Step 2.** |
| `ModuleBoundaryTest` | **Keep.** |
| Leanback launcher, `TvActivity` shell, `minSdk 24` | **Keep.** |
| Kover filter on `TuneInResolver` / `AvailabilityProjector` | **Rewrite in Step 2** to `TimerEngine`. |

---

## Non-negotiables

1. **Do not keep “playback position is a pure function of the wall clock”
   as a true statement.** If it survives in `ARCHITECTURE.md` §1, Step 2
   will build the wrong engine.
2. **Do not stretch `Slot` / `Lineup` / `IdealSlot` into timer snapshots.**
   Replacement, not aliasing.
3. **Do not start the watch clock at Setup complete or at rest expiry.**
   Those are the two ways confirmation becomes decorative.
4. **Do not promise device-wide YouTube blocking.** The Welcome note exists
   so we are not lying.
5. **Do not invent a download cache of YouTube media** in the new PRD.
6. **Do not leave old §11 as acceptance.** Green for this product is Step
   5, not “five channels play mid-program.”

---

## Tests and verification

This step is editorial. Verification:

- New PRD §11 matches [05](05-verify-policy-api-device.md)’s green
  definition, not the old eight boxes.
- Every legal phase arrow appears once; illegal arrows are named as
  `IllegalTransition`.
- Enforcement paragraph is identical on Welcome and settings (copy-paste
  the same string).
- `:core` still builds (`./gradlew :core:test`) because this step does not
  touch it.

---

## Implementation build order

1. Rewrite `docs/PRD.md`: overview, user, concepts, FRs, non-goals,
   flows, §11, open questions. Delete manifest/download/channel sections.
2. Rewrite `docs/ARCHITECTURE.md`: §1 hanging idea, retire §2
   amendments, new §3 module map, pointer to this folder for timer/PIN/
   player detail, keep §13 environment note.
3. Add a short historical banner at the top of `docs/PLAN.md` and
   `docs/prompts/README.md`: not the delivery track.
4. Confirm `docs/YOUTUBE_TIMER_PLAN.md` still has the five-step body plus
   the Step plans index.

---

## Open risks

| Risk | Mitigation |
|---|---|
| Implementers keep reading `PLAN.md` kickoffs and rebuild ExoPlayer | Banner on PLAN/prompts; this folder is linked from the parent plan; Step 4 explicitly forbids the YouTube-app and download fallbacks |
| PRD rewrite stays vague on residual risk and Step 4 over-promises | Verbatim enforcement paragraph; table above copied into architecture |
| D6 device still unnamed | Step 5 names Chromecast with Google TV (4K) as the default SKU; Step 1’s architecture records that a SKU is required before Step 4 hardware claims |
