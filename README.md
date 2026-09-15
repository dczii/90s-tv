# LittlePlay

A parent-configured YouTube timer for Android TV. A parent sets a PIN, watch
and rest durations, and an allowlist. A child watches curated YouTube inside
this app for a bounded window, then sits on a rest screen until **Continue
watching**.

The timer is enforced only inside this app. It cannot prevent viewing in the
official YouTube app or protect against uninstalling the app, clearing its
data, or changing the device clock.

## Delivery track

React Native (Expo TV + TypeScript `packages/core`). Do not implement the
Kotlin Compose rewrite in parallel against the same `applicationId`.

- [PRD](docs/PRD.md) — product requirements
- [Architecture](docs/ARCHITECTURE.md) — Expo TV module map and `RN-D*` locks
- [React Native plan](docs/REACT_NATIVE_PLAN.md) — five steps
- [Step plans](docs/react-native/) — stack, timer, YouTube, player, verify
- [Product law](docs/youtube-timer/) — `YT-D1`–`YT-D29` (Kotlin guts are not this track)

[`docs/PLAN.md`](docs/PLAN.md) and [`docs/prompts/`](docs/prompts/) are the
retired broadcast/download plan.

## Repo layout

```
packages/core    @littleplay/core — Node-testable domain (no react-native)
apps/tv          Expo app, slug littleplay, applicationId com.littleplay.tv
```

The Gradle `:core` / `:app` tree is historical on this track. Do not treat
`./gradlew :core:test` as green.

## Building

```
pnpm test                         # core Vitest (100% timerEngine) + tv kv mapping
pnpm --filter tv prebuild:tv      # EXPO_TV=1 expo prebuild --platform android --clean
pnpm --filter tv android          # needs ANDROID_HOME / an Android TV emulator or device
```

`packages/core` holds `TimerEngine`, `PinGate`, and the YouTube URL /
allowlist model (Node only). `apps/tv` supplies `device-time`,
`android-identity`, `expo-sqlite`, SecureStore OAuth tokens, and the
phase-driven D-pad shell. Copy `apps/tv/.env.example` → `.env` for API
keys. Expo SDK 57 wants Node 22 (see `.nvmrc`). Assemble needs JDK 17 and
an Android SDK; hardware OAuth / player verification is Step 5.

`tools/make-banner.py` still regenerates the historical Kotlin TV banner.
The React Native banner is `apps/tv/assets/tv-banner.png` (320×180),
produced by `tools/make-tv-banner.py`.
