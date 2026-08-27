# Kickoff prompt — Phase 6 (Hardening and acceptance)

Copy everything below the rule into a fresh session on this repo.

---

Work **Phase 6 (Hardening and acceptance)** of the Nostalgia Box delivery plan.

**Read first:** `docs/PLAN.md` (Phase P6), `docs/ARCHITECTURE.md` (§6.5, §12),
`docs/PRD.md` (**§11 in full** — this phase is that checklist).

**Branch:** develop on `claude/nostalgia-box-hardening-<suffix>`, commit, push. No PR.

**Prerequisite:** P5. Requires the D6 device and the C3 host.

## Scope

Break the app deliberately, fix what breaks, and walk the PRD's acceptance checklist
line by line.

**Out of scope:** every stretch item (P7). New features are not hardening.

## Build and verify

- **Corrupt file:** `onPlayerError` → mark `UNPLAYABLE` in Room → drop from the
  projection → advance. Test it for real: `dd` a downloaded file to truncate it
- **Whole channel unavailable:** no-signal slate, and **stay there**
- **Offline pass:** disconnect the network entirely and run every flow — cold start,
  channel flipping, force-stop and relaunch, reboot
- **Update pass:** bump the manifest version, add one file and remove another, confirm
  playback continues throughout and orphans are cleaned up afterwards
- **Low-space pass:** fill the device, confirm the warning fires before downloading
- **Interrupted-download pass:** kill mid-download, airplane-mode mid-download
- Optional daily background refresh (`PeriodicWorkRequest`, unmetered constraint)
- **Soak test:** leave it running 24h+ and check for drift accumulation, memory growth,
  and decoder leaks across many channel changes
- Walk PRD §11 line by line and **record the result of each in the PR or a checklist file**

## Non-negotiables

1. **Do not "fix" a corrupt file by removing it from the timeline.** It comes out of the
   *projection*. Removing it from the timeline changes `totalMs` and re-phases the
   channel — amendment A1's bug, arriving disguised as error handling.
2. **A dead channel does not auto-advance.** Show the slate and stay. Auto-advancing is
   the app making a choice on the user's behalf, which is the one thing this product
   exists not to do.
3. **Test offline by actually disconnecting.** An emulator with a stubbed network is not
   evidence. Pull the ethernet, disable Wi-Fi on the device, reboot it disconnected.
4. **The soak test is not optional and cannot be shortened.** Drift accumulation and
   decoder leaks are invisible in a five-minute session and obvious in a day. This is
   the only phase that can catch them.
5. **Record each acceptance criterion's result, don't summarise.** "All passing" is not
   a result. Eight lines with eight outcomes is.
6. **If a criterion fails and the fix is a design change, stop and say so.** Do not
   quietly reinterpret the criterion to make it pass.

## Exit criteria

Every box in `docs/PRD.md` §11 ticked on the D6 device, with the evidence for each
recorded:

- [ ] Installs on Google TV and appears on the home row
- [ ] First run downloads all 5 channels from the hosted manifest URL
- [ ] A channel plays automatically on launch, mid-program, with no menu
- [ ] D-pad up/down flips all 5 channels with a channel bug overlay
- [ ] Tune-in is time-based — switching away and back lands live, not at the start
- [ ] Play/pause does not pause; no rewind or seek is possible
- [ ] Works fully with the network disconnected after provisioning
- [ ] Interrupted downloads resume without restarting from zero

## Report back

The completed checklist with per-item evidence, anything that failed and what it cost to
fix, and the soak-test findings. If the design held up under all of this, say so — that
is a real result and P7 depends on knowing it.
