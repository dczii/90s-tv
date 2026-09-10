# Timed YouTube TV — Five-Step Plan

This plan replaces the original downloaded-media direction with a curated YouTube
player for Android TV. A parent connects an account or enters public YouTube links,
selects allowed content, and configures watch/rest durations behind a PIN.

The timer is enforced only inside this app. It cannot prevent viewing in the official
YouTube app or protect against uninstalling the app, clearing its data, or changing
the device clock.

## 1. Redefine the product and timer rules

- Replace the broadcast/download assumptions in the PRD and architecture.
- Model the lifecycle as:
  `Setup → Awaiting confirmation → Playing → Resting → Awaiting confirmation`.
- Make watch and rest durations configurable by a parent.
- Count elapsed session time even while paused, buffering, or backgrounded so those
  actions cannot extend the watch window.
- Persist deadlines across process restarts and TV reboots.
- Never resume automatically after rest; require an explicit **Continue watching**
  confirmation.

**Exit:** Timer behavior, enforcement limits, and acceptance criteria are documented
without ambiguity.

## 2. Build the persistent timer and parent controls

- Implement the timer state machine as pure Kotlin in `:core`.
- Store timer policy, current phase, deadlines, and recovery metadata locally.
- Add a parent PIN for changing durations, resetting timers, managing content, and
  connecting or disconnecting a YouTube account.
- Store a salted PIN verifier rather than the PIN itself and rate-limit failed attempts.
- Test expiry boundaries, restart/reboot recovery, duration changes, and confirmation
  requirements.

**Exit:** Closing or restarting the app cannot reset either timer, and protected
settings cannot be changed without the PIN.

## 3. Add YouTube connection and content curation

- Implement Google's OAuth flow for TVs and limited-input devices with the minimum
  `youtube.readonly` scope.
- Store refresh credentials using Android Keystore-backed encryption.
- Let a parent choose allowed playlists, subscribed channels, or individual videos
  from the connected account.
- Support manually entered public video and playlist URLs when no account is connected.
- Cache the selected allowlist and enough metadata to present useful error states.
- Handle expired authorization, revoked access, API quota errors, and unavailable
  content.

**Exit:** A parent can create and persist a playable allowlist using either a connected
account or manual YouTube links.

## 4. Implement controlled Android TV playback

- Embed the official YouTube IFrame Player API in an Android WebView.
- Use a narrow Kotlin/JavaScript bridge for loading allowed video IDs, observing player
  state, and stopping playback.
- At watch expiry, pause playback, remove the WebView/player, and display the locked
  rest countdown.
- After rest expiry, show the confirmation screen without constructing or autoplaying
  the player.
- Build D-pad-first screens for setup, account connection, content selection,
  confirmation, playback, rest countdown, and PIN-protected settings.
- Skip embedding-disabled, private, age-restricted, region-restricted, or removed
  videos and show an error if no allowed item can play.

**Exit:** Playback is limited to curated content and is reliably removed when the
watch deadline is reached.

## 5. Verify policy, API, and device behavior

- Run `:core` timer tests plus Android unit tests for persistence, URL parsing,
  authorization, and state restoration.
- Run lint and build checks for the Android app.
- Test on real Google TV hardware: D-pad focus, OAuth device-code flow, autoplay,
  ads, WebView codecs, expiry teardown, process restart, and device reboot.
- Confirm rest completion never autoplays and always requires **Continue watching**.
- Confirm PIN protection covers every path that can alter policy or content.
- Do not fall back to downloading/extracting YouTube streams or launching the official
  YouTube app if embedded playback is incompatible; record the platform blocker.

**Exit:** Automated checks pass and the complete watch/rest cycle works on the target
TV, including restart and reboot recovery.
