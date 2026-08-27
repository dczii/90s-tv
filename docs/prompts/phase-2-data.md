# Kickoff prompt — Phase 2 (Data layer)

Copy everything below the rule into a fresh session on this repo.

---

Implement **Phase 2 (Data layer)** of the Nostalgia Box delivery plan.

**Read first:** `docs/PLAN.md` (Phase P2), `docs/ARCHITECTURE.md` (§5.1, §5.2, §5.3, §9),
`docs/PRD.md` (FR10, FR12, §5).

**Branch:** develop on `claude/nostalgia-box-data-<suffix>`, commit, push. No PR.

**Prerequisite:** P1 (`:core` validator and DTOs). A local range-capable host is enough
to work against; C3 is not required until P3.

## Decisions assumed

- **A2, A3, A8 accepted** — the schema in `ARCHITECTURE.md` §5.1 is what you parse.
- **A8 offline boot.** Once provisioned, the app never blocks on the network.

## Scope

Manifest fetched, validated, persisted, and readable offline. Settings storage. Hilt wiring.

**Out of scope:** downloading media (P3), any player code (P4), any UI beyond what's
needed to prove the data layer works. Do not build the settings *screen* — build the
settings *storage*.

## Build

- Room: `channels` and `files` per `ARCHITECTURE.md` §5.2, with
  `status ∈ PENDING | DOWNLOADING | COMPLETE | UNPLAYABLE`
- DAOs exposing a `Flow` of completed files per channel — P4 observes this
- DataStore (Preferences): manifest URL override, last-watched channel id, last applied
  manifest version, last refresh timestamp
- `ManifestRepository` — OkHttp GET → hand the body to **`:core`'s** parser and validator
  → write to Room in one transaction
- Manifest URL resolution order: DataStore override → `adb` intent extra → `BuildConfig` default
- Network security config: cleartext permitted in **debug only**, blocked in release
- Hilt modules for database, OkHttp, DataStore, repositories
- Room migration policy: destructive is acceptable for MVP — the manifest is the source
  of truth and re-fetching costs nothing. State the choice in code.

## Non-negotiables

1. **Apply a manifest in one transaction, or not at all.** A partially-applied manifest
   is a channel lineup that matches no real content. `:core`'s validator runs *before*
   any write.
2. **Do not reimplement validation in `:app`.** Call `:core`. Two validators drift, and
   the one on the device is the one that matters.
3. **Startup must never block on the network.** If a manifest exists in Room, boot from
   it and refresh in the background. A device with no internet and five downloaded
   channels is a fully working product, not a degraded one.
4. **DataStore is for settings, not for the manifest.** Concurrent worker writes in P3
   turn a JSON blob into a read-modify-write race. Channels and files go in Room.
5. **Expose `Flow`, not one-shot reads, for file availability.** P4 needs to react when
   a download lands mid-playback; a suspend function that returns a snapshot cannot do that.
6. **Cleartext stays off in release.** The manifest URL is user-supplied — validate the
   scheme on entry.

## Verification

- MockWebServer: valid manifest, malformed JSON, manifest failing validation, 404, timeout
- Confirm a failing manifest leaves the previously stored one intact and serving
- Room instrumented test for the availability `Flow` emitting on status change

## Exit criteria

- Cold start with network off, having previously fetched: channels load from Room, no
  error, no spinner
- Cold start with no local data and no network: a clean "can't reach the channel guide"
  state, not a crash
- Manifest survives app kill and device reboot

## Report back

The repository API P3 and P4 will build against, the Room schema as built, and anything
`:core` didn't expose that you needed.
