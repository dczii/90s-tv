# Nostalgia Box

An algorithm-free, menu-free Android TV app that recreates broadcast television:
a channel is already playing mid-program when you turn it on, and the D-pad flips
channels like an old antenna set. No pause, no rewind, no content menu.

Channel content is downloaded from a hosted manifest rather than bundled in the APK.

## Status

Phase 1 built. `:core` — the broadcast clock — is implemented and tested: manifest
parsing and validation, the lineup timeline, wall-clock tune-in, availability
projection, channel selection, update diffing, drift correction, and the storage-path
and space-budget arithmetic. It is a plain Kotlin/JVM module, so `./gradlew :core:test`
runs anywhere a JDK does — no SDK, no emulator.

Phase 0 before it gave the app its two Gradle modules, a leanback launcher entry, and an
empty full-screen Activity that shows black. `:app` still has no behaviour: nothing is
wired to `:core` yet, and the data layer (P2) is the next phase.

- [PRD](docs/PRD.md) — product requirements (v1.0 MVP)
- [Architecture](docs/ARCHITECTURE.md) — technical design and decisions
- [Delivery plan](docs/PLAN.md) — phased work breakdown with exit criteria
- [Phase prompts](docs/prompts/) — kickoff briefs for each delivery phase

## Building

```
./gradlew :core:test        # plain JUnit, no Android SDK required
./gradlew :app:assembleDebug
```

`:core` is a plain Kotlin/JVM module with the Android Gradle plugin deliberately not
applied — that absence is a compiler-enforced boundary, not a convention, and the whole
test strategy rests on it. It builds and tests on a machine with no Android SDK; run
`:core:test` on its own rather than alongside a root task like `clean`, which would
configure `:app` and pull in the SDK requirement.

`:app` needs an Android SDK and access to Google's Maven. The container this scaffold
was authored in has neither (`dl.google.com` is blocked by network policy — see
[ARCHITECTURE.md §13](docs/ARCHITECTURE.md)), so the `:app` module has not been compiled
or installed here; the version pins under `com.android.*` in
[`gradle/libs.versions.toml`](gradle/libs.versions.toml) are unverified and should be
confirmed against current stable before release.

`tools/make-banner.py` regenerates the 320x180 TV banner and the launcher icon. It is
pure stdlib; the build has no image-tooling dependency.
