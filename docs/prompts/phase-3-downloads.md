# Kickoff prompt — Phase 3 (Download engine)

Copy everything below the rule into a fresh session on this repo.

---

Implement **Phase 3 (Download engine)** of the Nostalgia Box delivery plan.

**Read first:** `docs/PLAN.md` (Phase P3), `docs/ARCHITECTURE.md` (§5.3, §5.4, §5.5, §2.4),
`docs/PRD.md` (FR10, FR11, FR13, §5.2).

**Branch:** develop on `claude/nostalgia-box-downloads-<suffix>`, commit, push. No PR.

**Prerequisites:** P2, and **C3 — a real host with verified Range support.** This is
where the two tracks meet. Do not start against a host you have not verified returns `206`.

## Decisions assumed

- **A4 accepted.** The host honours HTTP Range. A `200` in reply to a ranged request is
  a *failure*, not a fallback to tolerate silently.
- **A2, A8 accepted.** `sizeBytes` drives the space check; `sha256` is required and is
  the storage key.

## Scope

Downloading, resuming, verifying, and the update flow.

**Out of scope:** playback (P4), the setup progress *screen* (P5 — but expose the
progress state P5 will render).

## Build

- `ChannelSyncWorker` — **one per channel**, unique-named, `NetworkType.CONNECTED`
  constraint, promoted to foreground for its duration
- Foreground plumbing: `POST_NOTIFICATIONS` on API 33+; `foregroundServiceType="dataSync"`
  and `FOREGROUND_SERVICE_DATA_SYNC` on API 34+
- `RangedDownloader` per `ARCHITECTURE.md` §5.5:
  - download to `<sha256>.mp4.part`
  - resume with `Range: bytes=<len>-` when a partial exists
  - expect `206`; a `200` means the host ignored Range → truncate and restart
  - throttle `bytesDownloaded` writes to ~1/sec
  - hash on completion; mismatch → delete, retry, **cap at 3**
  - atomic rename `.part` → `<sha256>.mp4`, mark `COMPLETE`
- Storage: `<externalFilesDir>/channels/<channelId>/<sha256>.mp4`
- Free-space check before enqueueing: `StatFs` free vs `sum(sizeBytes) * 1.1`
- Concurrency capped at **2 channels**
- Update flow (§5.4): compare `version` → diff by hash → transaction → enqueue additions
  → delete orphans **only after** their replacements are `COMPLETE`

## Non-negotiables

1. **A `200` in reply to a ranged request is a hard failure.** Appending a full-file
   response onto an existing partial produces a corrupt file that passes every check
   except the hash — and then burns three retries. Detect the status code, truncate,
   restart, and log it loudly. This is the single most damaging bug available in this phase.
2. **`.part` plus atomic rename, always.** A file at its final path is, by definition,
   complete and verified. Never write directly to the target name.
3. **One worker for all five channels will be killed mid-run.** WorkManager's execution
   window is finite. Per-channel bounds each worker's runtime and gives P5 the progress
   unit it actually displays.
4. **Cap the hash-mismatch retry.** Uncapped, a genuinely corrupt upstream file becomes
   an infinite download loop that silently eats the user's bandwidth.
5. **Delete orphans only after replacements are `COMPLETE`.** Otherwise a failed update
   leaves a channel emptier than it started — the one outcome worse than not updating.
6. **Throttle progress writes.** Per-chunk `bytesDownloaded` updates will hammer the
   database and measurably slow the download they are reporting on.
7. **Verify against the real host, not a mock.** Mocks are for the failure paths; the
   happy path must be proven against C3.

## Verification

- MockWebServer: clean `206`; `200`-ignoring-Range; mid-stream truncation; hash mismatch;
  404 on one file of many; connection drop and resume
- On-device: kill the app mid-download and relaunch; airplane-mode mid-download and restore
- Fill the device and confirm the low-space warning fires *before* any download starts
- A real manifest `version` bump with one file added and one removed

## Exit criteria

- **Kill the app mid-download and relaunch: it resumes from where it stopped, not from
  zero.** This is a PRD acceptance criterion — demonstrate it, don't infer it.
- All five channels download and verify against the C3 host
- A failed update leaves the previous content intact and playable

## Report back

Real first-run provisioning time and total on-device footprint against the C3 host, plus
any host behaviour that surprised you. P4 needs to know the shape of the progress state
you expose.
