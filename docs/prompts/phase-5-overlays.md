# Kickoff prompt — Phase 5 (Overlays and settings)

Copy everything below the rule into a fresh session on this repo.

---

Implement **Phase 5 (Overlays and settings)** of the Nostalgia Box delivery plan.

**Read first:** `docs/PLAN.md` (Phase P5), `docs/ARCHITECTURE.md` (§7, §6.5),
`docs/PRD.md` (FR7, FR11, FR12, §10.1).

**Branch:** develop on `claude/nostalgia-box-overlays-<suffix>`, commit, push. No PR.

**Prerequisite:** P4.

## Scope

Everything the user sees that isn't video. The app must explain itself without ever
showing a menu.

**Out of scope:** any change to playback behaviour. If you are touching
`TvPlayerController`'s tune-in logic, you have left the phase.

## Build

- `ComposeView` overlay above the XML `PlayerView`
- **Channel bug** (FR7): `CH 03 · Rabbit`, ~3s, fade out, lower-left
- **Setup progress** (§10.1): per-channel bars, fed by P3's progress state
- **No-signal slate**: the error state, the provisioning empty state, and the foundation
  for P7's static transition — build it as a real component, not a placeholder
- **Hidden settings** (FR12), long-press OK: manifest URL entry, "Update channels",
  per-channel storage footprint, and the log tail
- Ring-buffer log to `filesDir`, surfaced in settings

## Non-negotiables

1. **Keep the video surface out of Compose.** `PlayerView` stays in XML with a
   `ComposeView` layered above it. Wrapping the player surface in Compose invites
   surface/composition bugs for no benefit — the overlays are the only real UI here.
2. **Respect the TV safe area.** Televisions overscan. An overlay flush to the edge of
   the layout is an overlay partly off the screen on real hardware. Inset it, and
   verify on the D6 device rather than the emulator.
3. **The channel bug updates instantly, ahead of the player.** P4 debounces the *load*;
   the bug must reflect every keypress immediately, or fast flipping feels broken.
4. **Setup progress dismisses when channel 01 is playable, not when everything is done.**
   The PRD's first-run flow starts playing while the rest downloads behind the picture.
   Blocking until all five complete is a ~40-minute stare at a progress bar.
5. **Settings must not be reachable by accident.** Long-press OK, 2 seconds. A child
   holding the remote must not land in the manifest URL field.
6. **D-pad focus everywhere, no touch assumptions.** Every interactive element must be
   reachable and visibly focused with the remote alone.
7. **The log is the only debugging tool this product has.** There is no analytics by
   design, so when a remote operator's channel 3 is black, this is it. Make it readable
   on a TV from three metres — that means large type and few lines, not a dump.

## Verification

- Flip channels rapidly and confirm the bug keeps up while the player settles
- Fresh install against the real host: confirm playback starts before all channels finish
- Every overlay checked on the D6 device for overscan clipping
- Navigate all of settings with the remote only

## Exit criteria

- FR7, FR11, FR12 demonstrable on the D6 device
- First run shows progress and starts playing channel 01 before the other four finish
- The no-signal slate renders for a channel with no available files

## Report back

Screenshots or a short capture from the real device, and confirmation that nothing in
P4's playback path changed.
