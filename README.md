# Nostalgia Box

An algorithm-free, menu-free Android TV app that recreates broadcast television:
a channel is already playing mid-program when you turn it on, and the D-pad flips
channels like an old antenna set. No pause, no rewind, no content menu.

Channel content is downloaded from a hosted manifest rather than bundled in the APK.

## Status

Phase P1 complete: `:core`, the broadcast clock, is implemented and tested. It is a
plain Kotlin/JVM module with no Android dependency, so `./gradlew :core:test` runs
anywhere a JDK does — no SDK, no emulator. Everything from P2 (data layer) onward is
still design only.

- [PRD](docs/PRD.md) — product requirements (v1.0 MVP)
- [Architecture](docs/ARCHITECTURE.md) — technical design and decisions
- [Delivery plan](docs/PLAN.md) — phased work breakdown with exit criteria
- [Phase prompts](docs/prompts/) — kickoff briefs for each delivery phase
