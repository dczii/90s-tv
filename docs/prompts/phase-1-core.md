# Kickoff prompt — Phase 1 (`:core`)

Copy everything below the rule into a fresh session on this repo.

---

Implement **Phase 1 (`:core` — the broadcast clock)** of the Nostalgia Box delivery plan.

**Read first:** `docs/PLAN.md` (Phase P1), `docs/ARCHITECTURE.md` (§1, §2.1, §2.3, §3, §4,
§5.1), `docs/PRD.md` (FR1–FR6). Where they disagree, the architecture document wins on
*how* and the PRD wins on *what*.

**Branch:** develop on `claude/nostalgia-box-core-<suffix>`, commit, push. Do not open a PR.

## Decisions already made — build to these, don't re-litigate

- **A1 accepted.** The channel timeline is derived from every file the manifest
  declares. Availability is a *separate, later* projection.
- **A3 accepted.** `durationMs`, not `durationSec`. Declared duration is authoritative;
  the actual media file never influences the timeline.
- **A2 + A8 accepted.** `sizeBytes` and `sha256` are both required on every file entry.
- **D5.** Pure loop only. Parse and reserve the `schedule` field; a non-null value
  falls back to loop behaviour and logs. No scheduling resolver in this phase.

## Scope

Only `:core`, plus the minimum Gradle scaffold needed to build and test it.

**Explicitly out of scope:** the `:app` module, `AndroidManifest.xml`, Room, OkHttp,
WorkManager, ExoPlayer, DataStore, Hilt, and any UI. Those are P0's Android half and
P2 onward. If you find yourself reaching for one of them, you have left the phase.

## Scaffold

The repo is documentation-only today. Create `settings.gradle.kts`,
`gradle/libs.versions.toml`, and `core/build.gradle.kts`.

- `:core` is a **plain Kotlin/JVM module**. Do not apply the Android Gradle plugin, and
  do not add any `androidx.*` or `android.*` dependency. That absence *is* the
  compiler-enforced boundary the whole test strategy rests on — see `ARCHITECTURE.md` §3.
- Dependencies: `kotlinx-serialization-json` and a test framework. Nothing else.
- Pin every version in the catalog. No floating versions.
- **Do not attempt to install the Android SDK.** Phase 1 building without one is a
  deliberate property of the design, not a workaround.

## Build

Per `ARCHITECTURE.md` §4 and §5.1:

- `model/` — `Slot`, `Lineup`, `IdealSlot`, `Channel`, `MediaFile`, `FileStatus`
- `manifest/` — serialization DTOs and `ManifestValidator`
- `LineupBuilder` — cumulative `startMs` across all declared files; `totalMs` from
  declared durations
- `TuneInResolver.resolve(lineup, nowEpochMs): IdealSlot`
- `AvailabilityProjector.project(lineup, ideal, availableIds): PlayableSlot`
- `ChannelSelector` — next/previous with wraparound (FR5), direct tune by number
- `ManifestDiffer` — additions and orphans by `sha256`, for the P3 update flow

## Non-negotiables

These are the specific bugs this phase exists to prevent. Each one is cheap to
introduce and expensive to find later.

1. **`resolve()` and `project()` stay separate functions.** Do not fuse them for
   convenience. Fusing them is amendment A1's failure mode: the channel re-phases every
   time a download completes, and cross-device sync dies permanently.
2. **`totalMs` is the sum of *declared* durations** — every file in the manifest,
   downloaded or not, playable or not. An unavailable file is a hole the projector
   skips, never a slot the builder omits.
3. **`Math.floorMod`, not `%`.** A device with a pre-1970 clock must not produce a
   negative index.
4. **Validation is all-or-nothing.** A manifest that fails any check is rejected whole,
   with a named error. Never half-apply one.
5. **`ignoreUnknownKeys = true`** on the JSON parser, so future manifest fields don't
   break installed clients.

## Tests

Property-style over a `FakeClock`, not one example apiece. This is where every real bug
in this product will live.

- For many random `now`: the resolved slot satisfies
  `startMs <= cycle < startMs + durationMs`
- Slots tile `[0, totalMs)` with no gap and no overlap
- `resolve(t) == resolve(t + totalMs)`
- Wraparound: the last slot's end resolves to slot 0, offset 0
- Edge cases: single-file lineup; `now == 0`; negative `now`
- **A1 as an executable assertion — write this one explicitly:** adding a file to the
  manifest changes the channel's phase; marking a file *unavailable* does not
- `ChannelSelector` wraps in both directions across 5 channels
- `ManifestDiffer` over manifest pairs: unchanged, added, removed, replaced-at-same-URL
- `ManifestValidator` rejects each of: empty channel list, empty file list, zero or
  negative duration, duplicate channel `id`, duplicate `sha256` within a channel,
  missing required field

## Exit criteria

- `./gradlew :core:test` green on a machine with no Android SDK installed
- 100% branch coverage on `TuneInResolver` and `AvailabilityProjector` — it is fifty
  lines, there is no excuse
- `grep -ri "android" core/src` returns nothing

## Report back

1. The public API surface of `:core`, so P2 and P4 can be written against it.
2. Anything in `ARCHITECTURE.md` you found wrong, underspecified, or unbuildable while
   implementing it. The design is a hypothesis and this phase is the first real test of
   it — say so plainly rather than working around it silently.
3. Anything P2 will need from `:core` that isn't there yet.
