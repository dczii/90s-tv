# Kickoff prompt — C2 (Transcode pipeline and manifest generator)

Copy everything below the rule into a fresh session on this repo.

---

Implement **Phase C2 (Transcode pipeline and manifest generator)** of the Nostalgia Box
delivery plan.

**Read first:** `docs/PLAN.md` (Phase C2), `docs/ARCHITECTURE.md` (§5.1, §8, §2.5).

**Branch:** develop on `claude/nostalgia-box-pipeline-<suffix>`, commit, push. No PR.

**Prerequisite:** C1 approved. Requires `ffmpeg`/`ffprobe`, not an Android SDK.

## Decisions assumed

- **A2, A3, A8 accepted.** Every file entry carries `durationMs`, `sizeBytes`, and a
  required `sha256`.
- **D5.** `schedule` is emitted as `null` for all channels.

## Scope

Two scripts and their output. **The manifest is a build artifact — nobody hand-edits it.**

**Out of scope:** hosting (that's C3), and any app code.

## Build

- `tools/transcode.sh` — per `ARCHITECTURE.md` §8:
  ```
  ffmpeg -i in.mkv \
    -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 21 \
    -vf "scale=-2:720,fps=24" \
    -g 48 -keyint_min 48 -sc_threshold 0 \
    -c:a aac -b:a 128k -ar 48000 -ac 2 \
    -movflags +faststart out.mp4
  ```
- `tools/build-manifest.py` — walks the transcoded tree and emits the schema in
  `ARCHITECTURE.md` §5.1: `durationMs` from `ffprobe`, `sizeBytes` from `stat`,
  `sha256` computed, `version` bumped on every regeneration
- Validate the emitted manifest against the same parser `:core` uses, so a bad manifest
  fails on the operator's laptop rather than on the TV
- `tools/README.md` — how to run the pipeline end to end

## Non-negotiables

1. **`-g 48 -keyint_min 48 -sc_threshold 0` at 24fps is a 2-second fixed GOP, and it is
   architecture, not a quality setting.** It bounds worst-case tune-in error and is most
   of the channel-switch budget. Get it wrong and Phase 4 will present as a player bug
   that no amount of player work fixes. If you change the frame rate, change `-g` to match.
2. **Uniform resolution and frame rate within each channel.** Mixing them forces a
   decoder reconfiguration at every item boundary — a visible stutter exactly where the
   app is pretending to be a continuous broadcast. Across channels it doesn't matter.
3. **Read duration from the video stream, not just the container.** `ffprobe`'s
   `format.duration` and `streams[v].duration` can disagree by hundreds of milliseconds.
   Pick the stream, be consistent, and record which you used — the app treats this
   number as authoritative for all time (A3).
4. **Bump `version` on every regeneration.** The app's entire update flow keys off it;
   a stale version means devices silently never update.
5. **Never hand-edit the manifest.** If it needs a field the generator doesn't emit,
   change the generator.

## Verification

- Regenerate twice with no input change → byte-identical output except `version`/`updatedAt`
- Every declared `durationMs` matches `ffprobe` to within 100ms
- Every `sha256` matches the file on disk
- `ffprobe -select_streams v -show_frames` confirms keyframes ~every 48 frames
- Feed the output to `:core`'s validator (if P1 has landed) and confirm it passes

## Exit criteria

- `./tools/build-manifest.py out/` produces a manifest `:core` accepts
- All five channels transcoded, uniform within each channel, within the D3 ceiling
- Total footprint recorded

## Report back

Total size per channel, the actual per-channel runtime, and any source item that
wouldn't transcode cleanly. Also confirm which `ffprobe` duration field you used.
