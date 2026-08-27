# Kickoff prompt — Phase 7 (Stretch)

Copy everything below the rule into a fresh session on this repo.

---

Work **Phase 7 (Stretch)** of the Nostalgia Box delivery plan.

**Read first:** `docs/PLAN.md` (Phase P7), `docs/ARCHITECTURE.md` (§2.7, §6.5),
`docs/PRD.md` (§12).

**Branch:** develop on `claude/nostalgia-box-stretch-<suffix>`, commit, push. No PR.

**Prerequisite: P6 passed in full.** If any PRD §11 criterion is still failing, stop and
finish P6 instead. Nothing here is worth a regression in the shipped product.

## Pick one, finish it, then pick the next

These are independent. Do not start three. Ordered by value-to-effort:

### 1. Static-noise transition on channel change — *start here*
The single change that most sells the illusion, and P5's no-signal slate is already the
surface it renders on. A brief static burst between channels, ~200–300ms, timed inside
the existing debounce so it costs no additional latency.

### 2. Auto-launch on boot (FR15) — *time-box it*
`RECEIVE_BOOT_COMPLETED` receiver starting the Activity. **Expect this to be blocked on
retail Google TV** by background activity-start restrictions (amendment A7). Give it a
day; if it doesn't work on the D6 device, document the finding and move on. Do not
reach for `SYSTEM_ALERT_WINDOW` or similar workarounds.

### 3. CRT shader via Media3 Effects
Scanlines, vignette, chromatic aberration. Watch the GPU budget on low-end boxes and
make it toggleable in settings — this is the one stretch item that can degrade the
core experience if it costs too much.

### 4. Per-channel daily schedules (FR4) — *not a small change*
**This is not a flag.** It breaks the constant-divisor model `:core` is built on and
needs its own resolver alongside `TuneInResolver`. Budget it as a real chunk of work
with its own test suite. The `schedule` field is already reserved in the manifest schema,
so no version bump is needed — but the timeline logic is genuinely new.

### 5. Smaller items
Cache eviction and size caps; on-screen-keyboard onboarding for the manifest URL; more
than five channels; favourites and reordering.

## Non-negotiables

1. **P6's acceptance criteria stay green.** Re-run the checklist before every merge. A
   stretch feature that breaks offline playback or the tune-in invariant is a net loss.
2. **The invariant survives all of it.** Static transitions, shaders and schedules must
   not introduce a stored playback position. Scheduling in particular must remain a pure
   function of the wall clock — a different function, but still pure.
3. **Anything with a GPU or CPU cost is toggleable and defaults off** until measured on
   the D6 device. Do not ship a shader that makes channel switching miss its budget.
4. **Time-box FR15 and accept the answer.** If the platform blocks it, that is a finding
   to document, not an obstacle to engineer around.
5. **Schedules need `:core` tests before `:app` code.** The same discipline as P1 — the
   resolver is where the bugs will be.

## Exit criteria

Per item: it works on the D6 device, PRD §11 still passes in full, and any performance
cost is measured and recorded.

## Report back

Which items you completed, the measured cost of each, and — for FR15 specifically —
whether it worked on the target hardware. That answer settles amendment A7 one way or
the other and should go back into `ARCHITECTURE.md`.
