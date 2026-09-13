# Phase kickoff prompts

One brief per phase of [the delivery plan](../PLAN.md). Each is self-contained: copy
everything below the rule in a file into a fresh session on this repo, and it carries
its own context, scope boundaries, and exit criteria.

> [!WARNING]
> **These prompts predate [QR-YOUTUBE.md](../QR-YOUTUBE.md) and have not been rewritten
> for it.** Current status of each:
>
> | Prompt | Status |
> |---|---|
> | `content-1-sourcing`, `content-2-pipeline`, `content-3-hosting` | **Void.** The content track is deleted — content is user-chosen |
> | `phase-3-downloads` | **Void.** There is no download engine |
> | `phase-0-scaffold` | Usable, with B6's manifest changes (leanback not required, both launcher categories) |
> | `phase-1-core` | Usable, with B7's model changes (`sha256`→`videoId`, selection replaces manifest) |
> | `phase-2-data` | **Replaced** by QR-YOUTUBE.md §7's P2 (selection + pairing + DataStore) |
> | `phase-4-player` | **Replaced** by §7's P3 (IFrame in a WebView, per B11) |
> | `phase-5-overlays`, `phase-6-hardening` | Mostly usable; see §7's P4/P5 for the deltas |
> | `phase-7-stretch` | Reordered, see §9 |
>
> Sequencing comes from [QR-YOUTUBE.md §7](../QR-YOUTUBE.md), not from the table below.

## Order

| Prompt | Phase | Needs Android SDK | Blocked on |
|---|---|---|---|
| [content-1-sourcing.md](content-1-sourcing.md) | C1 · Source the content | no | D3 |
| [content-2-pipeline.md](content-2-pipeline.md) | C2 · Transcode + manifest generator | no | C1 |
| [content-3-hosting.md](content-3-hosting.md) | C3 · Host and verify | no | C2, D4 |
| [phase-0-scaffold.md](phase-0-scaffold.md) | P0 · Scaffold | **yes** | D2 |
| [phase-1-core.md](phase-1-core.md) | P1 · `:core` broadcast clock | no | D1, D5 |
| [phase-2-data.md](phase-2-data.md) | P2 · Data layer | yes | P1 |
| [phase-3-downloads.md](phase-3-downloads.md) | P3 · Download engine | yes | P2, C3 |
| [phase-4-player.md](phase-4-player.md) | P4 · Player | yes | P1, P3, D6 |
| [phase-5-overlays.md](phase-5-overlays.md) | P5 · Overlays and settings | yes | P4 |
| [phase-6-hardening.md](phase-6-hardening.md) | P6 · Hardening and acceptance | yes | P5 |
| [phase-7-stretch.md](phase-7-stretch.md) | P7 · Stretch | yes | P6 |

**Start C1 and P0/P1 on the same day.** The content track is on the critical path — the
app cannot be meaningfully tested past P2 without real hosted media, and C3 must land
before P3 starts.

## Before any of them

Settle the six decisions in [PLAN.md, Phase −1](../PLAN.md). Each prompt states the
decisions it assumes; if you overrule one, edit that block before handing the prompt over.

## Shape of every prompt

Read first · Branch · Prerequisites · Decisions assumed · Scope (in **and** out) ·
Build · Non-negotiables · Verification · Exit criteria · Report back.

The **non-negotiables** section is the load-bearing one. It names the specific bugs each
phase exists to prevent — the ones that are cheap to introduce, pass review, and surface
three phases later wearing a different costume.
