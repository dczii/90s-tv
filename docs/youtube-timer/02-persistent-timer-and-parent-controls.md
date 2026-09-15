# Step 2 — Persistent timer and parent controls

**Parent:** [LittlePlay — Five-Step Plan](../YOUTUBE_TIMER_PLAN.md) §2
**Status:** blocked on Step 1’s rewritten PRD/architecture (the rules this
engine encodes).
**Produces:** `:core` timer + PIN API with JUnit tests; `:app` DataStore
adapter, `TimeView` factory, PIN UI wired to Welcome / Timer setup / Parent
settings (screens can be ugly; Step 4 owns visual pass). Broadcast `:core`
types deleted.

---

## Goal

Put the Step 1 phase machine in a JVM-testable engine, persist deadlines so
process death and reboot cannot reset them, and gate policy changes behind a
salted PIN verifier with lockout. `:app` supplies time and storage;
`:core` never imports Android.

---

## Exit criterion

Copied from the parent plan and sharpened:

- [ ] `./gradlew :core:test` green on this machine (no Android SDK).
      `ModuleBoundaryTest` still passes. Kover 100% branch/line on
      `TimerEngine` (replace the `TuneInResolver` / `AvailabilityProjector`
      filter).
- [ ] Killing the app during `Playing` and during `Resting`, then
      relaunching on the same boot, restores remaining time from the
      monotonic deadline (instrumented in `:core` via `TimeView`; `:app`
      adapter covered by unit tests on a machine with an SDK, Step 5).
- [ ] Simulated reboot (`bootCount` incremented, `elapsedRealtimeMs`
      reset, wall clock advanced) restores from the wall-clock deadline
      and does not grant a fresh watch window.
- [ ] `confirmWatching` is required to enter `Playing`. Rest expiry and
      `completeSetup` land on `AwaitingConfirmation`.
- [ ] Duration change preserves elapsed time in the current phase
      (`YT-D12`). PIN mismatch and lockout reject duration, reset,
      and (once Step 3 exists) content/account actions.
- [ ] The PIN is not stored; a salted PBKDF2-HmacSHA256 verifier
      (`Mac("HmacSHA256")` in `:core`) is. Failed attempts rate-limit.

---

## Read first

- [01-product-and-timer-rules.md](01-product-and-timer-rules.md) (`YT-D1`–`YT-D7`)
- [YOUTUBE_TIMER_PLAN.md](../YOUTUBE_TIMER_PLAN.md) §2
- [ARCHITECTURE.md](../ARCHITECTURE.md) §3 and §13 (module split, env)
- `core/src/test/kotlin/com/littleplay/core/ModuleBoundaryTest.kt`
- `core/build.gradle.kts` (Kover filter you will retarget)
- [DESIGN_BRIEF.md](../../designs/DESIGN_BRIEF.md) — Welcome, Timer setup,
  Parent settings, PIN cells, duration steppers

---

## Product / user-visible outcome

Screens this step owns functionally (Step 4 restyles):

- **Welcome / Parent setup** — “Set up with parent PIN”; enforcement note
  from Step 1.
- **Timer setup** — watch/rest steppers on the YT-D5 grid; PIN create +
  confirm; Save → `completeSetup` (phase becomes `AwaitingConfirmation`).
  Empty allowlist is OK; Continue watching stays disabled until Step 3.
- **Parent settings** — PIN gate, then policy summary, reset cycle
  (destructive), duration steppers. Connect/content rows can be disabled
  stubs until Step 3. First-run Connect and content picker (after this
  Save, still the wizard) are **not** PIN-gated; the same screens from
  Parent settings **are**. Continue watching is never PIN-gated.
- **Ready / Rest** — enough of a phase-driven shell that remaining time
  updates; no WebView.

---

## Technical design

### `:core` API

```kotlin
data class TimeView(
    val elapsedRealtimeMs: Long, // monotonic since boot
    val wallClockMs: Long,       // epoch ms; may jump
    val bootCount: Int?,         // null = unknown; never collapse missing BOOT_COUNT to 0
)

data class TimerPolicy(
    val watchDurationMs: Long,
    val restDurationMs: Long,
)

data class PersistedTimer(
    val phase: TimerPhase,
    val policy: TimerPolicy,
    val watchDeadlineElapsedMs: Long?,
    val watchDeadlineWallMs: Long?,
    val restDeadlineElapsedMs: Long?,
    val restDeadlineWallMs: Long?,
    val phaseStartElapsedMs: Long?,
    val phaseStartWallMs: Long?,
    val deadlineBootCount: Int?,
)

data class TimerSnapshot(
    val phase: TimerPhase,
    val policy: TimerPolicy,
    val remainingMs: Long,           // 0 in Setup and AwaitingConfirmation
    val confirmationRequired: Boolean,
)

sealed class TimerEvent {
    data class Unchanged(val snapshot: TimerSnapshot) : TimerEvent()
    data class PhaseChanged(
        val from: TimerPhase,
        val to: TimerPhase,
        val snapshot: TimerSnapshot,
        val reason: PhaseChangeReason,
    ) : TimerEvent()
}

enum class PhaseChangeReason {
    SetupCompleted, WatchConfirmed, WatchExpired, RestExpired,
    CycleReset, RecoveredPastWatch, RecoveredPastRest, PolicyExpiredCurrentPhase,
}

class TimerEngine(initial: PersistedTimer) {
    fun snapshot(now: TimeView): TimerSnapshot
    fun tick(now: TimeView): TimerEvent
    fun completeSetup(policy: TimerPolicy, now: TimeView): TimerCommandResult
    fun confirmWatching(now: TimeView): TimerCommandResult
    fun changePolicy(policy: TimerPolicy, now: TimeView): TimerCommandResult
    fun resetCycle(now: TimeView): TimerCommandResult
    fun persisted(): PersistedTimer
}

sealed class TimerCommandResult {
    data class Applied(val event: TimerEvent) : TimerCommandResult()
    data class Rejected(val error: TimerError) : TimerCommandResult()
}

sealed class TimerError {
    data object SetupIncomplete : TimerError()
    data class PolicyOutOfRange(val field: String, val valueMs: Long) : TimerError()
    data class IllegalTransition(val from: TimerPhase, val attempted: String) : TimerError()
}
```

`TimerPhase` is YT-D1. Commands return `TimerCommandResult.Applied` or
`Rejected(TimerError)`. `tick` always applies: it is the only expiry path.
`PhaseChanged` only when `from != to`.

Rejected alternative: `SystemClock` inside `:core`. Time enters as
`TimeView`. Tests own every field. Production mapping lives in `:app`:

```kotlin
fun Context.deviceTime(): TimeView {
    // getString: missing BOOT_COUNT is null; a real 0 stays 0. Do not use
    // getInt(..., def = 0) — that cannot tell unknown from boot 0.
    val bootCount = Settings.Global.getString(
        contentResolver, Settings.Global.BOOT_COUNT,
    )?.toIntOrNull()
    return TimeView(
        elapsedRealtimeMs = android.os.SystemClock.elapsedRealtime(),
        wallClockMs = System.currentTimeMillis(),
        bootCount = bootCount,
    )
}
```

Rejected alternative: a `:core` `BroadcastClock` with one `nowEpochMs`.
That interface cannot express reboot vs in-boot and is the retired product.

### Dual-clock persistence

| Domain | Used for | Not used for |
|---|---|---|
| `elapsedRealtimeMs` + `bootCount` | In-boot remaining, same-boot process restart | Reboot (monotonic resets) |
| `wallClockMs` | Reboot recovery only | In-session expiry (NTP would steal or grant time) |

On every persist while `Playing` or `Resting`, write **both** deadline
pairs and `deadlineBootCount`.

**Phase-start origin.** Write `phaseStartElapsedMs` /
`phaseStartWallMs` on phase *entry*, not only on reboot rewrite.
`confirmWatching` (enter `Playing`) sets both to `now`. Entering
`Resting` (watch expiry or `RecoveredPastWatch`) sets both to the
watch-expiry instant — the persisted watch deadline in each domain
(`watchDeadlineElapsedMs` / `watchDeadlineWallMs`), not restore-`now`.
`resetCycle` and any landing on `AwaitingConfirmation` or `Setup`
clear both. YT-D12 then has a real origin on first boot.

**Recover in `tick` / `snapshot` before computing remaining:**

Treat as **reboot / wall-only** when any of these is true: `now.bootCount`
is null (unknown), `deadlineBootCount` is null, `now.bootCount !=
deadlineBootCount`, or (belt-and-braces) `phaseStartElapsedMs` is set
and `now.elapsedRealtimeMs < phaseStartElapsedMs`.

1. Same boot (both boot counts non-null and equal, and the elapsed
   wrap check did not fire): remaining is `deadlineElapsed -
   now.elapsedRealtimeMs` (floor at 0).
2. Reboot / unknown boot count: remaining is `deadlineWall -
   now.wallClockMs` (floor at 0). Then rewrite the following:
   - both monotonic deadlines against `now`:
     `watchDeadlineElapsedMs = now.elapsedRealtimeMs + max(0,
     watchDeadlineWallMs - now.wallClockMs)` (if that wall deadline is
     set; else leave null). Same formula for `restDeadlineElapsedMs`.
   - `phaseStartElapsedMs = max(0, now.elapsedRealtimeMs -
     (now.wallClockMs - phaseStartWallMs))`. If `phaseStartWallMs` is
     null, set `phaseStartElapsedMs = now.elapsedRealtimeMs`.
   - `deadlineBootCount = now.bootCount` (may still be null if unknown).
   `:app` persists that rewrite after the **first `tick` of each
   process**, including when `tick` returns `Unchanged`. When
   `now.bootCount` is permanently null, rewrite monotonic fields
   **at most once per process**, not on every 1 Hz tick (null
   `bootCount` would otherwise match the reboot predicate forever).
   Document wall-clock rollback after reboot as residual risk (parent
   plan).
3. Expiry uses the recovered remaining, but rest *anchoring* still uses
   the persisted watch deadline as the expiry instant (YT-D3), not
   restore-`now`.

Rejected: only wall clock (NTP mid-watch moves the window). Rejected: only
monotonic (reboot looks like a fresh 15 minutes).

No foreground service in v1. Tick every 1s while the Activity is
`STARTED`. `onStart` always `tick`s before composing a player. If expiry
happened while stopped, the first frame is rest or confirmation, never a
player. Residual: rest UI can appear late while backgrounded; the window
still does not extend.

### Duration change (`YT-D12`)

Preserve **elapsed time in the current phase**. Recompute the current
deadline as `phaseStart + newDuration` in both clock domains.

- Increasing watch during `Playing` lengthens remaining.
- Decreasing watch so elapsed ≥ new duration → remaining 0;
  `tick` emits `PolicyExpiredCurrentPhase` (command does not itself
  transition; `tick` does, so the player teardown path is one).
- Changing rest during `Playing` does not move the watch deadline.
- `AwaitingConfirmation` / `Setup`: store the new policy; no deadline.

Rejected: replace remaining with the full new duration from `now`. That
lets a child spend 14 minutes, then get a parent to “change 15 to 60”
and receive a fresh hour.

`resetCycle` → `AwaitingConfirmation`, clears both deadline pairs
and both `phaseStart*` fields. PIN required in `:app` before calling
it. From `AwaitingConfirmation`, emit `Unchanged` (already there; no
player). `PhaseChanged` only when `from != to`.

### Persistence schema — Preferences DataStore, not Room

Timer + PIN are one document of scalars. Room is reserved for the
allowlist (Step 3: rows, `Flow`, playlist expansion).

Rejected: Room for a one-row timer (ceremony, no query). Rejected: Proto
DataStore (codegen for ~15 keys). Rejected: SharedPreferences unencrypted
for the PIN verifier — DataStore is the existing settings tool; the
verifier is not a secret we decrypt (salt+hash), so Keystore wrapping is
the wrong model.

Keys:

```
phase, watch_duration_ms, rest_duration_ms,
watch_deadline_elapsed_ms, watch_deadline_wall_ms,
rest_deadline_elapsed_ms, rest_deadline_wall_ms,
phase_start_elapsed_ms, phase_start_wall_ms,
deadline_boot_count,
pin_salt, pin_hash, pin_iterations,
pin_failed_attempts, pin_lockout_elapsed_ms, pin_lockout_wall_ms, pin_lockout_boot_count
```

Step 4 adds `allowlist_cursor_entry_id` and `allowlist_cursor_index` to
this same DataStore document (Room stays content-only).

`:app` writes `persisted()` after every `Applied` command, every
`PhaseChanged`, and after the first `tick` of each process (covers a
reboot rewrite that returns `Unchanged`). When `bootCount` is
permanently null, rewrite monotonic fields at most once per process,
not on every 1 Hz tick. Reads once at process start into `TimerEngine`.

### PIN — hash in `:core`

```kotlin
data class PinRecord(val salt: ByteArray, val hash: ByteArray, val iterations: Int)

data class PinLockout(
    val failedAttempts: Int,
    val lockoutElapsedMs: Long?,
    val lockoutWallMs: Long?,
    val lockoutBootCount: Int?,
)

sealed class PinError {
    data object InvalidFormat : PinError()   // not exactly 4 digits 0-9
    data object Mismatch : PinError()
    data class LockedOut(val remainingMs: Long) : PinError()
}

sealed class PinResult {
    data object Ok : PinResult()
    data class Failed(val error: PinError) : PinResult()
}

object PinHasher {
    const val ITERATIONS = 120_000
    fun hash(pin: String, salt: ByteArray, iterations: Int = ITERATIONS): PinRecord
    fun verify(pin: String, record: PinRecord): Boolean  // MessageDigest.isEqual
}

class PinGate(record: PinRecord, lockout: PinLockout) {
    fun verify(pin: String, now: TimeView): PinResult  // mismatch updates lockout; already-locked returns LockedOut without increment
    fun setPin(pin: String): PinRecord                 // setup or change-after-verify
    fun lockout(): PinLockout
}
```

KDF: **PBKDF2-HmacSHA256** implemented in `:core` over
`javax.crypto.Mac("HmacSHA256")`. Do **not** call
`SecretKeyFactory.getInstance("PBKDF2withHmacSHA256")` — that algorithm
is API 26+ and would force a minSdk bump. minSdk stays **24**. 16-byte
salt, 32-byte dk, 120_000 iterations. `verify` compares digests with
`MessageDigest.isEqual`. PIN is **4 numeric digits**. `:core` hash/verify
stay **synchronous**; `:app` runs them off the main thread (Default
dispatcher) before applying the result. Threat model is the child with
the remote; lockout is the control. Offline cracking after `adb pull` is
residual, same class as data-clear.

Rejected: hash in `:app` with Android Keystore so `:core` stays “crypto
free” — then tests need an SDK, and Keystore wrapping implies a
reversible secret. We store a verifier; we must not be able to read the
PIN back. Rejected: bcrypt/argon2 (extra native deps on a JVM module).
Rejected: bumping minSdk to 26 for `SecretKeyFactory` PBKDF2.

**Lockout:** after the 5th failure, lock 30s. A `verify` while already
locked returns `LockedOut` and does **not** increment or double.
Doubling applies to the next mismatch *after* the lockout expires
(60s, 120s, …), cap 15 min. Success resets the counter and the
ladder. Lockout deadlines use the same dual-clock recover as the
timer. Persist after every attempt.

PIN gates (`:app` checks `PinGate` before calling the engine or Step 3
APIs): duration change, cycle reset, content management, YouTube
connect/disconnect — **when entered from Parent settings**. Continue
watching is **never** gated. First-run PIN create is not gated. Connect
and the content picker during the first-run wizard (after
`completeSetup`) are **not** PIN-gated.

### Failure model

| Failure | Named result |
|---|---|
| `confirmWatching` while not `AwaitingConfirmation` | `IllegalTransition` |
| `completeSetup` twice | `IllegalTransition` |
| Duration off grid / out of range | `PolicyOutOfRange` |
| PIN not 4 digits | `InvalidFormat` |
| Wrong PIN | `Mismatch`; increment failures |
| PIN while locked | `LockedOut(remainingMs)`; do not increment or double |
| DataStore read missing (fresh install) | `PersistedTimer` at `Setup`, no PIN record |
| `BOOT_COUNT` unavailable | `TimeView.bootCount = null`; recovery is wall-only; log it. Do not treat missing as 0. |

### Important flows

**Same-boot kill in `Playing`.** Persist deadlines. New process: boot
matches → remaining from elapsedRealtime → stay `Playing` if remaining
> 0. Step 4 may recreate the player; this step only restores the phase.

**Reboot in `Playing`.** `bootCount` differs or is unknown, elapsedRealtime
near 0. Remaining from wall deadline. Rewrite both monotonic deadlines,
`phaseStartElapsedMs`, and `deadlineBootCount` on the first `tick` of
the process (persist even on `Unchanged`; at most once per process if
`bootCount` stays null). If still watching, stay `Playing`. If wall
says expired, rest-anchor from the persisted watch wall deadline
(YT-D3); `phaseStart*` for `Resting` is that watch-expiry instant,
not restore-`now`.

**Expiry while Activity stopped.** Next `onStart` `tick` → `Resting` or
`AwaitingConfirmation`. No player frame.

---

## Decisions already made

- YT-D1–D7 (Step 1).
- `:core` has no `android.*` / `androidx.*`.
- Dual-clock strategy in the briefing (monotonic in-boot, wall for reboot).
- Salted verifier, never the PIN. PIN gates durations, reset, content,
  YouTube connect/disconnect when those screens are entered from Parent
  settings. Wizard Connect/picker after `completeSetup` are not gated.
  Continue watching is never gated.
- Step 4 tears down the player on `PhaseChanged` to `Resting`; this step
  only emits the event.

---

## Decisions this step must lock

| ID | Decision | Lock |
|---|---|---|
| **YT-D8** | `TimeView` | `elapsedRealtimeMs`, `wallClockMs`, `bootCount: Int?` (null = unknown). Injected; no `SystemClock` in `:core`. |
| **YT-D9** | Storage | Preferences DataStore for timer + PIN. Room waits for Step 3’s allowlist. |
| **YT-D10** | PIN KDF boundary | PBKDF2-HmacSHA256 in `:core` via `Mac("HmacSHA256")`. Not `SecretKeyFactory` PBKDF2. 4-digit numeric. `MessageDigest.isEqual`. minSdk 24 unchanged. `:core` API synchronous; `:app` hashes off main. |
| **YT-D11** | Lockout | After 5th failure lock 30s. Verify while locked returns `LockedOut` without increment/double. Next mismatch after lockout expires doubles the next lockout, cap 15 min. Success resets counter and ladder. Dual-clock persist. |
| **YT-D12** | Mid-session duration change | Preserve elapsed in the current phase; recompute deadline from `phaseStart + newDuration`. `phaseStart*` written on phase entry (`confirmWatching` → `now`; Resting → watch-expiry instant); cleared on `AwaitingConfirmation` / `Setup`. `tick` expires. |
| **YT-D13** | Recovery | Same boot → monotonic. Reboot, unknown `bootCount`, or elapsed wrap (`now.elapsedRealtimeMs < phaseStartElapsedMs`) → wall, then rewrite both monotonic deadlines, `phaseStartElapsedMs`, and `deadlineBootCount`. Persist after the first `tick` of each process (covers `Unchanged`). When `bootCount` is permanently null, rewrite monotonic fields at most once per process, not on every 1 Hz tick. Clock rollback after reboot is residual. |

---

## Scope in / Scope out

**In:** Delete broadcast `:core` types and tests. Add `timer/` and `pin/`.
Retarget Kover. DataStore adapter. `deviceTime()`. PIN + duration + reset
UI shell. `TvActivity` drives phase from `TimerEngine`.

**Out:** Room allowlist, OAuth, WebView, IFrame, design polish, EncryptedSharedPreferences.
Do not add Media3 or WorkManager.

---

## What this step retires or amends

| Item | Action |
|---|---|
| All broadcast types listed in [README](README.md) | Delete sources and tests |
| `FakeClock` | Replace with a mutable `TimeView` test double |
| Kover class filter | `com.littleplay.core.timer.TimerEngine` |
| ARCHITECTURE §4 domain / §5.2 Room files / §6 ExoPlayer | Already rewritten in Step 1; this step matches that text in code |
| `BroadcastClock` using `System.currentTimeMillis` in `:core` | Delete; wall clock is a `TimeView` field supplied by `:app` |

---

## Non-negotiables

1. **`tick` is the only expiry.** `changePolicy` must not hide player
   teardown inside a command — Step 4 listens for `PhaseChanged`.
2. **Pause is not a phase.** Remaining in `Playing` uses deadlines, not a
   stopped ticker.
3. **Never persist the PIN.** Grep for pin plaintext in DataStore writes
   must be empty.
4. **Do not import `android.os.SystemClock` in `:core`.**
5. **Same-boot restart must not use wall clock remaining.** NTP during a
   crash-restart would steal or grant minutes.
6. **Reboot must not use leftover monotonic values.** `elapsedRealtime`
   near 0 would look like a full window.
7. **Confirmation required** after setup and after every rest, including
   recovery that skipped a fully elapsed rest.

---

## Tests and verification

`:core` (this machine):

- Phase arrows; every illegal command → `IllegalTransition`.
- `confirmWatching` starts remaining at `watchDurationMs`; time does not
  start in `Setup` or `AwaitingConfirmation`.
- Advance `elapsedRealtimeMs` without changing wall: expiry still fires.
- Advance wall without elapsed: in-boot remaining unchanged.
- Kill/restore same boot: remaining matches.
- Reboot: `bootCount++`, elapsedRealtime=0, wall += 5 min into a 15 min
  watch → remaining ≈ 10 min, not 15.
- Kill across the watch deadline: land in `Resting` with rest remaining
  computed from the watch deadline, not from restore-now.
- Kill across watch+rest: `AwaitingConfirmation`, no auto `Playing`.
- `YT-D12`: 15 min watch, 10 elapsed, change to 20 → remaining 10; change
  to 5 → remaining 0 and next `tick` rests.
- Reboot then `changePolicy`: after wall recovery rewrites
  `phaseStartElapsedMs`, YT-D12 still preserves elapsed in the current
  phase (not a fresh window from restore-`now`).
- `confirmWatching` writes `phaseStartElapsedMs` / `phaseStartWallMs`
  to `now`. Entering `Resting` writes them to the persisted watch
  deadline (not restore-`now`). `resetCycle` / `AwaitingConfirmation`
  / `Setup` clears both.
- `resetCycle` from `AwaitingConfirmation` emits `Unchanged`;
  `PhaseChanged` only when `from != to`.
- Permanently null `bootCount`: rewrite monotonic fields on the first
  `tick` of the process, not on a second 1 Hz tick.
- PIN: hash/verify (`Mac("HmacSHA256")`, `MessageDigest.isEqual`),
  4-digit format, 5× mismatch → `LockedOut` 30s. A `verify` while
  locked returns `LockedOut` and does not increment or double.
  Mismatch after lockout expires doubles (60s, …), cap 15 min.
  Success resets the counter and the ladder. Lockout survives a
  reconstructed `PinGate` from persisted fields.
- `ModuleBoundaryTest` unchanged.

`:app` persistence tests wait for Step 5’s SDK machine.

---

## Implementation build order

1. Delete broadcast `:core` sources/tests; keep `ModuleBoundaryTest`.
2. `TimeView`, `TimerPolicy` (grid + `DEFAULT`), `TimerError`,
   `TimerEngine` + property tests.
3. Retarget Kover; `./gradlew :core:test`.
4. `PinHasher` / `PinGate` + tests.
5. `:app` DataStore + `deviceTime()` + engine holder; persist after
   every `Applied` command, every `PhaseChanged`, and the first `tick`
   of each process.
6. Welcome, Timer setup, PIN cells, Parent settings (PIN gate, steppers,
   reset), phase shell for confirmation/rest without a player.

---

## Open risks

| Risk | Mitigation |
|---|---|
| `BOOT_COUNT` missing on a weird box | `bootCount = null`; recovery is wall-only; belt-and-braces elapsed wrap still detects reboot |
| 4-digit PIN offline brute force | Residual, documented; lockout is the on-device control; do not add Keystore-wrapped plaintext |
| Activity-only ticker while backgrounded | Absolute deadlines + `onStart` tick; late rest UI accepted; no extra watch time |
| Step 4 recreates WebView before `tick` on resume | Build order: `onStart` → `tick` → then player. Named again in Step 4 |
