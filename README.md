# Nostalgia Box

An algorithm-free, menu-free Android TV app that recreates broadcast television:
a channel is already playing mid-program when you turn it on, and the D-pad flips
channels like an old antenna set. No pause, no rewind, no content menu.

Channels are chosen by the viewer, once: on first launch the TV shows a QR code, a phone
on the same Wi-Fi picks up to 5 YouTube videos, and those become the channels.

## Status

Design phase. No implementation yet.

**Start with [QR-YOUTUBE.md](docs/QR-YOUTUBE.md)** — it is the current design, and it
supersedes parts of the three documents below.

- [QR selection + YouTube channels](docs/QR-YOUTUBE.md) — **current design**: the QR
  pairing flow, the move to the YouTube IFrame player, and the revised delivery plan
- [PRD](docs/PRD.md) — product requirements (v1.0 MVP); §5, §6 and the offline
  requirements superseded
- [Architecture](docs/ARCHITECTURE.md) — technical design and decisions; the wall-clock
  invariant and `:core` stand, the player and data layers are superseded
- [Delivery plan](docs/PLAN.md) — original phased breakdown; resequenced in QR-YOUTUBE.md §7
- [Phase prompts](docs/prompts/) — kickoff briefs; several are void, see that README
