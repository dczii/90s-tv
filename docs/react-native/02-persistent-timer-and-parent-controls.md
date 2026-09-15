# Step 2 — Persistent timer and parent controls

**Parent:** [React Native Five-Step Plan](../REACT_NATIVE_PLAN.md) §2
**Status:** done. `@littleplay/core` ships `TimerEngine` + `PinGate` with
Vitest (100% branch/line on `timerEngine.ts`). `apps/tv` supplies
`device-time`, `expo-sqlite` kv, and D-pad Welcome / Timer setup / PIN /
Parent settings / phase shell. `pnpm test` is green on Node.
**Blocked on:** nothing for Step 3.
**Produces:** `@littleplay/core` timer + PIN API with Vitest; `device-time`
native module; `expo-sqlite` adapter; PIN UI wired to Welcome / Timer setup /
Parent settings (screens can be ugly; Step 4 owns visual pass).

---

## Goal

Put the YouTube-timer Step 1 phase machine in a Node-testable engine, persist
deadlines so process death and reboot cannot reset them, and gate policy
changes behind a salted PIN verifier with lockout. `apps/tv` supplies time
and storage; `packages/core` never imports React Native.

Types, transitions, dual-clock recovery, YT-D12 duration changes, and PIN
lockout **are not re-specified**. They are
[`youtube-timer/02`](../youtube-timer/02-persistent-timer-and-parent-controls.md).
This file only maps them onto TypeScript, SQLite, and an Expo module.

---

## Exit criterion

Copied from the parent plan and sharpened:

- [x] `npm test -w packages/core` green on this machine (no Android SDK).
      Boundary lint still forbids `react-native`. Coverage 100% branch/line
      on `timerEngine.ts`.
- [x] Killing the app during `Playing` and during `Resting`, then relaunching
      on the same boot, restores remaining time from the monotonic deadline
      (instrumented in core via `TimeView`; sqlite adapter unit-tested in
      Node with a file DB; native `device-time` tested on an SDK machine in
      Step 5).
- [x] Simulated reboot (`bootCount` incremented, `elapsedRealtimeMs` reset,
      wall clock advanced) restores from the wall-clock deadline and does
      not grant a fresh watch window.
- [x] `confirmWatching` is required to enter `Playing`. Rest expiry and
      `completeSetup` land on `AwaitingConfirmation`.
- [x] Duration change preserves elapsed time in the current phase (YT-D12).
      PIN mismatch and lockout reject duration, reset, and (once Step 3
      exists) content/account actions.
- [x] The PIN is not stored; a salted PBKDF2-HMAC-SHA256 verifier is.
      Failed attempts rate-limit.

---

## Read first

- [01-stack-and-module-map.md](01-stack-and-module-map.md) (`RN-D1`–`RN-D11`)
- [youtube-timer/01](../youtube-timer/01-product-and-timer-rules.md) (`YT-D1`–`YT-D7`)
- [youtube-timer/02](../youtube-timer/02-persistent-timer-and-parent-controls.md)
  — **the API, persist schema keys, recover algorithm, PIN lockout, and
  test list are law.** Port them; do not redesign them.
- [DESIGN_BRIEF.md](../../designs/DESIGN_BRIEF.md) — Welcome, Timer setup,
  Parent settings, PIN cells, duration steppers

---

## Product / user-visible outcome

Same screens as Kotlin Step 2 (Step 4 restyles):

- **Welcome / Parent setup** — “Set up with parent PIN”; enforcement note.
- **Timer setup** — watch/rest steppers on the YT-D5 grid; PIN create +
  confirm; Save → `completeSetup`.
- **Parent settings** — PIN gate, policy summary, reset cycle, duration
  steppers. Connect/content rows can be disabled stubs. Wizard Connect/
  picker after Save are **not** PIN-gated. Continue watching is never
  PIN-gated.
- **Ready / Rest** — phase-driven shell that updates remaining time; no
  WebView.

---

## Technical design

### `packages/core` API

Port the Kotlin API from YouTube-timer 02 to TypeScript. Same names, same
errors, same legal transitions. Differences that are allowed:

| Kotlin                             | TypeScript                                         |
| ---------------------------------- | -------------------------------------------------- |
| `Long` milliseconds                | `number` (safe for epoch ms)                       |
| `Int?` bootCount                   | `number \| null` — **never** coerce missing to `0` |
| `sealed class`                     | discriminated unions                               |
| `TimerEngine` class, sync commands | same, sync commands                                |
| `PinHasher.hash` sync              | **`async`** (`RN-D7`). `PinGate.verify` is `async` |
| `ByteArray` salt/hash              | `Uint8Array`; persist as base64 in sqlite          |

```ts
export type TimeView = {
  elapsedRealtimeMs: number;
  wallClockMs: number;
  bootCount: number | null;
};

export type TimerPhase = "Setup" | "AwaitingConfirmation" | "Playing" | "Resting";
```

`PersistedTimer`, `TimerPolicy`, `TimerSnapshot`, `TimerEvent`,
`PhaseChangeReason`, `TimerCommandResult`, `TimerError`, `PinRecord`,
`PinLockout`, `PinError`, `PinResult` — field-for-field from 02.

`tick` remains the only expiry path. Commands never autoplay. Recovery
that is already past watch+rest collapses to `AwaitingConfirmation` and
emits one `PhaseChanged`.

Rejected: storing `TimerEngine` inside Zustand as a bag of booleans that
drift from `persisted()`. The engine is the authority; UI reads
`snapshot()`. Rejected: `Date.now()` inside core. Time enters as
`TimeView`.

### `device-time` native module

```kotlin
// Expo module Function, not a View
fun deviceTime(): Bundle {
  val bootCountStr = Settings.Global.getString(
    context.contentResolver, Settings.Global.BOOT_COUNT
  )
  val bootCount = bootCountStr?.toIntOrNull() // null if missing — not 0
  return bundleOf(
    "elapsedRealtimeMs" to SystemClock.elapsedRealtime(),
    "wallClockMs" to System.currentTimeMillis(),
    "bootCount" to bootCount, // omit key or pass null; JS sees null
  )
}

fun addActivityResumeListener() { /* emit "onActivityResume" */ }
```

JS:

```ts
export function deviceTime(): TimeView {
  const raw = DeviceTime.deviceTime();
  return {
    elapsedRealtimeMs: raw.elapsedRealtimeMs,
    wallClockMs: raw.wallClockMs,
    bootCount: raw.bootCount ?? null,
  };
}
```

Also export an `onActivityResume` event. `AppState` `'active'` is **not**
sufficient alone: the first JS paint can race ahead of AppState. Sequence
in the root component:

1. Subscribe to `onActivityResume` and `AppState`.
2. On either: `event = engine.tick(deviceTime())`; persist if Step 2 rules
   say so; **then** set React state from `engine.snapshot()`.
3. Player (Step 4) mounts only from that snapshot.

Rejected: `react-native-device-info` (no `BOOT_COUNT` semantics, extra
dep). Rejected: treating `elapsedRealtime` as `performance.now()`.

Dual-clock recover / rewrite / “first tick of each process” / null
`bootCount` rewrite-once: **copy the algorithm from YouTube-timer 02**.
Do not invent a third clock.

### Persistence — `expo-sqlite`, not AsyncStorage

TV-supported. One DB `littleplay.sqlite`.

```
kv(key TEXT PRIMARY KEY, value TEXT NOT NULL)

-- keys, same names as YouTube-timer 02 DataStore:
phase, watch_duration_ms, rest_duration_ms,
watch_deadline_elapsed_ms, watch_deadline_wall_ms,
rest_deadline_elapsed_ms, rest_deadline_wall_ms,
phase_start_elapsed_ms, phase_start_wall_ms,
deadline_boot_count,
pin_salt, pin_hash, pin_iterations,
pin_failed_attempts, pin_lockout_elapsed_ms, pin_lockout_wall_ms,
pin_lockout_boot_count
```

Step 4 adds `allowlist_cursor_entry_id`, `allowlist_cursor_index` to `kv`.
Step 3 adds `allowlist_entries` and `yt_catalog_cache` tables in this same
database (not a second file).

Write `engine.persisted()` after every `Applied` command, every
`PhaseChanged`, and after the first `tick` of each process. When
`bootCount` is permanently null, rewrite monotonic fields at most once
per process.

Reads once at process start into `TimerEngine`.

PIN salt/hash: base64 in `kv`. Never a `pin` key.

Rejected: AsyncStorage (untyped JSON blob, no transactions with allowlist).
Rejected: `react-native-mmkv` (not on Expo’s TV library list; extra native).
Rejected: `expo-secure-store` for the PIN verifier (it is not a secret we
decrypt; YT-D10). Rejected: Proto/DataStore from RN.

SQLite adapter lives in `apps/tv/src/data/`. Core never imports expo-sqlite.
Node tests for the adapter may use `better-sqlite3` against the same SQL
if the adapter is written as `SqliteKv` with an injected `execute` function;
otherwise adapter tests wait for Step 5. Prefer an injected driver so the
mapping of `PersistedTimer` ↔ rows is tested here.

### PIN — `@noble/hashes` in core (RN-D7)

```ts
export const PIN_ITERATIONS = 120_000;

export async function hashPin(
  pin: string,
  salt: Uint8Array,
  iterations = PIN_ITERATIONS,
): Promise<PinRecord>;

export async function verifyPin(pin: string, record: PinRecord): Promise<boolean>;
```

- Algorithm: PBKDF2-HMAC-SHA256 via `pbkdf2Async(sha256, pin, salt, { c, dkLen: 32 })`.
- Salt 16 bytes from `crypto.getRandomValues` in **the app** (core accepts a
  salt; tests pass a fixture). In Node tests, `node:crypto` is fine.
- Compare with `@noble/hashes/utils` `equalBytes` (constant-time).
- PIN is exactly 4 digits `0-9`. `InvalidFormat` otherwise.
- Lockout: copy YT-D11 (5 failures → 30s; locked verify does not increment;
  doubling after expiry, cap 15 min; dual-clock persist).

`PinGate.verify` is async. UI awaits it; disable the PIN cells while
pending so a D-pad mash cannot overlap verifies.

Rejected: `expo-crypto` (no PBKDF2). Rejected: dropping iterations to
“feel faster” on JS. 120k async on a Chromecast is the cost of matching
YT-D10; measure in Step 5, do not pre-emptively weaken. Rejected: hashing
in the native module “because TV JS is slow” unless Step 5 records >2s
and then native hash **must** match core test vectors.

### Tick while started

No foreground service in v1. `setInterval` 1s while `AppState === 'active'`
and the JS runtime is running. On resume, always `tick` before composing a
player. Residual: rest UI can appear late while backgrounded; the window
still does not extend (absolute deadlines).

### Duration change (YT-D12)

Preserve elapsed in the current phase. `phaseStart*` written on phase
entry. Port the Kotlin rules verbatim. `changePolicy` does not itself
transition; `tick` emits `PolicyExpiredCurrentPhase`.

### Failure model

Same named errors as YouTube-timer 02, plus:

| Failure                                | Named result                                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `device-time` missing on a phone build | Do not ship; Leanback required. Dev: throw at boot                                                    |
| sqlite open fails                      | Stay on a blocking error slate; do not pretend Setup with empty memory that will later overwrite disk |
| `BOOT_COUNT` unavailable               | `bootCount = null`; wall-only recover; log                                                            |

### Important flows

Same as YouTube-timer 02 (same-boot kill, reboot, expiry while stopped).
RN translation: “Activity `onStart`” → `onActivityResume` + `tick` before
setState.

---

## Decisions already made

- YT-D1–D13, RN-D1–D11.
- Dual-clock strategy. Salted verifier. PIN gates from Parent settings
  only. Continue watching never gated.

---

## Decisions this step must lock

| ID         | Decision        | Lock                                                                                                        |
| ---------- | --------------- | ----------------------------------------------------------------------------------------------------------- |
| **RN-D12** | Time source     | Expo module `device-time`. `bootCount` from `Settings.Global.getString`; missing ≠ 0.                       |
| **RN-D13** | KV store        | `expo-sqlite` table `kv`, keys identical to YouTube-timer 02.                                               |
| **RN-D14** | Engine lifetime | One `TimerEngine` per JS runtime, created after kv read, held outside React. React subscribes to snapshots. |
| **RN-D15** | Resume          | Native `onActivityResume` + AppState; tick then snapshot then maybe player.                                 |

No new product IDs. YT-D8–D13 stay.

---

## Scope in / Scope out

**In:** Port engine + PIN to core. Vitest list from YouTube-timer 02.
`device-time`. sqlite kv. Welcome / Timer setup / PIN / Parent settings /
phase shell. Coverage on `timerEngine.ts`.

**Out:** Allowlist tables, OAuth, `youtube-player`, design polish,
`expo-secure-store`. Do not add ExoPlayer, `expo-video`, or WorkManager.

---

## What this step retires or amends

| Item                                        | Action                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| Kotlin `TimerEngine` plan as implementation | Do not write it on this track                                                   |
| Broadcast `:core` types                     | Do not port. Optional delete of Kotlin sources after this Vitest suite is green |
| `FakeClock`                                 | Mutable `TimeView` in tests                                                     |

---

## Non-negotiables

1. **`tick` is the only expiry.** Player teardown (Step 4) listens for
   `PhaseChanged`.
2. **Pause is not a phase.**
3. **Never persist the PIN.** Grep `apps/tv` + `packages/core` for writes
   of the raw PIN must be empty.
4. **Do not import `react-native` in `packages/core`.**
5. **Same-boot restart must not use wall remaining.**
6. **Reboot must not use leftover monotonic values.**
7. **Confirmation required** after setup and after every rest.

---

## Tests and verification

`packages/core` (this machine) — port the bullet list from YouTube-timer
02 Tests section (phase arrows, confirmWatching start, elapsed vs wall,
kill/restore, reboot, YT-D12, phaseStart writes, null bootCount rewrite
once, PIN lockout ladder). Use fake `TimeView`.

`apps/tv` sqlite + `device-time` tests wait for Step 5’s SDK machine.

---

## Implementation build order

1. Port types + `TimerEngine` + tests. Coverage gate.
2. `PinHasher` / `PinGate` + tests (`pbkdf2Async`).
3. `device-time` module; JS `deviceTime()`.
4. sqlite `kv` adapter; hydrate engine at boot; persist rules.
5. Welcome, Timer setup, PIN cells, Parent settings, confirmation/rest
   shell without a player.
6. `onActivityResume` tick wiring.

---

## Open risks

| Risk                               | Mitigation                                                                |
| ---------------------------------- | ------------------------------------------------------------------------- |
| JS 120k PBKDF2 feels slow on D6    | Async; disable cells while pending; measure in Step 5 before going native |
| AppState misses first resume       | Native activity event is the primary trigger                              |
| expo-sqlite API changes across SDK | Pin SDK; adapter behind `KvStore` interface                               |
| CNG `--clean` drops `device-time`  | Local Expo module under `apps/tv/modules/` so prebuild keeps it           |
