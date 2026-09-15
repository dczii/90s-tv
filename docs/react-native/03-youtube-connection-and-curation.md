# Step 3 — YouTube connection and content curation

**Parent:** [React Native Five-Step Plan](../REACT_NATIVE_PLAN.md) §3
**Status:** done. Device-code OAuth, SecureStore tokens, `android-identity`,
Data API client, core URL parser + allowlist types, sqlite allowlist /
catalog tables, Connect YouTube and Choose content screens. Manual path
works without tokens. `pnpm test` green on Node.
**Produces:** device-code OAuth in JS, `expo-secure-store` tokens,
`android-identity` native module, Data API reads, core allowlist + URL
parser, sqlite allowlist, Connect YouTube and Choose allowed content
screens. No player.

---

## Goal

Let a parent persist a playable allowlist of YouTube **IDs and metadata**,
either from a `youtube.readonly` TV OAuth session or from public URLs typed
on the D-pad. The two paths write the same sqlite table. Nothing in this
step fetches video bytes.

OAuth endpoints, named token errors, Data API calls, allowlist types, URL
matrix, skip policy, and PIN gating **are not re-specified**. They are
[`youtube-timer/03`](../youtube-timer/03-youtube-connection-and-curation.md).
This file maps them onto `fetch`, SecureStore, and one native identity module.

---

## Exit criterion

Copied from the parent plan and sharpened:

- [x] Device-code flow (RFC 8628) shows the verification URL and user
      code; a successful poll stores access + refresh tokens in
      `expo-secure-store`. Scope is only
      `https://www.googleapis.com/auth/youtube.readonly`.
- [x] Parent can select playlists and subscriptions from the account, and
      persist them as `AllowlistEntry` rows.
- [x] With **no** account, parent can add public video and playlist URLs;
      they persist in the same table with `source = ManualUrl`.
- [x] Relaunch restores the allowlist and, if tokens exist, the signed-in
      state without repeating the user-code screen.
- [x] Expired auth, revoked access, quota, unavailable, and not-embeddable
      have named errors and parent-visible copy. An empty or fully
      unplayable allowlist disables Continue watching (Step 4); it does
      not crash.
- [x] No file under app storage is a YouTube media body.

---

## Read first

- [01](01-stack-and-module-map.md), [02](02-persistent-timer-and-parent-controls.md)
- [youtube-timer/03](../youtube-timer/03-youtube-connection-and-curation.md)
  — **OAuth, API tables, `AllowlistEntry`, URL parser, cache TTL, skip
  policy, non-negotiables are law.**
- [DESIGN_BRIEF.md](../../designs/DESIGN_BRIEF.md) — Connect YouTube,
  Choose allowed content
- Google: OAuth 2.0 for TVs and Limited Input Devices; YouTube Data API v3

---

## Product / user-visible outcome

Identical to YouTube-timer 03: Connect (large user code, URL, local QR,
read-only sentence, **Use links instead**), Choose allowed content (tabs
Playlists / Subscriptions / Manual link), Continue watching disabled while
the saved allowlist is empty. Wizard vs Parent-settings PIN gating unchanged.

---

## Technical design

### Device-code OAuth (RFC 8628)

JS `fetch` to `https://oauth2.googleapis.com/device/code` and `/token`.
Client type **TVs and Limited Input devices**. Poll at `interval`; honor
`slow_down` (+5s). Map token errors to the named set in 03
(`AuthDeviceCodeExpired`, `AuthDenied`, `AuthRevoked`, `AuthExpired`).

QR: `react-native-qrcode-svg` (JS). Encodes `verification_url` (or
Google’s complete URL if present). No network QR service.

Cancel stops polling and does not write tokens.

Rejected: looping a WebView through accounts.google.com. Rejected:
opening the YouTube app / Custom Tabs to “help” sign-in. Rejected:
`expo-auth-session` authorization-code flow (needs a browser; not the TV
device-code flow).

`apps/tv` owns HTTP, polling, and UI. Core owns nothing of OAuth.

### Token storage (YT-D15 → RN)

`expo-secure-store` keys: `access_token`, `refresh_token`,
`access_expiry_wall_ms`, `token_type`. Android backend is Keystore /
EncryptedSharedPreferences — same class as Kotlin’s lock.

Disconnect: `deleteItemAsync` each key, revoke via
`https://oauth2.googleapis.com/revoke` best-effort, **keep** the
allowlist.

Rejected: sqlite for tokens. Rejected: AsyncStorage for tokens.

`client_secret` still ends up in the app (TV OAuth client). Residual,
readonly scope, same as Kotlin.

### `android-identity` native module (RN-D3)

Unauthenticated Data API calls need a restricted Android API key plus:

```
X-Android-Package: com.littleplay.tv
X-Android-Cert: <SHA-1 hex of the signing cert>
```

```kotlin
fun packageName(): String = context.packageName

fun signingCertSha1Hex(): String {
  // PackageManager signingInfo / signatures; lowercase hex, no colons
}
```

`fetch` wrappers in `apps/tv/src/youtube/client.ts` attach those headers
on API-key requests. OAuth access-token requests use `Authorization`
instead. Register the **debug** signing SHA-1 before Step 5 sideload.

Rejected: hard-coding a SHA-1 in JS (debug vs release will 403). Rejected:
`youtube.com/oembed` as a metadata path (no `embeddable` flag).

API key + OAuth client: `apps/tv/.env` via `expo-constants` extra /
`app.config.ts` reading `YOUTUBE_API_KEY`, `YOUTUBE_CLIENT_ID`,
`YOUTUBE_CLIENT_SECRET` from `local.properties` or `.env` **not committed**.
`EXPO_PUBLIC_*` is acceptable only if we accept the key is in the JS bundle
(it will be anyway). Do not put secrets in git.

### Allowlist model (`packages/core`)

Port `AllowlistKind`, `AllowlistSource`, `AllowlistEntry`, `AllowlistError`
from 03. IDs + metadata only.

sqlite (`apps/tv`):

```
allowlist_entries(
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  thumbnail_url TEXT,
  embeddable INTEGER,          -- null / 0 / 1
  source TEXT NOT NULL,
  added_at_wall_ms INTEGER NOT NULL,
  last_probed_wall_ms INTEGER
)

yt_catalog_cache(
  kind TEXT PRIMARY KEY,       -- playlists | subscriptions
  payload_json TEXT NOT NULL,
  fetched_at_wall_ms INTEGER NOT NULL
)
```

Observe via a query in the repository; React holds the list from a hook
that re-reads on save. Do not invent a second cache in memory that can
disagree with sqlite after a kill.

Thumbnails: `expo-image` remote URLs, fail soft. Do not download thumbnail
files into a media cache.

A selected subscription persists as one `AllowlistEntry` `{ kind: 'Playlist',
id: relatedPlaylists.uploads }`. Expand at probe/play in Step 4 with
`loadVideo` only.

### URL parser (`packages/core`, pure)

Port the URL table from 03. Use the WHATWG `URL` class (available in
Node and Hermes). Never `react-native` linking APIs. Watch+list → video
id. Reject channel URLs and clips.

Parser tests run here without an SDK.

### Cache / staleness / skip policy

Copy 03: 24h catalog TTL; PK = `kind`; playback uses last-known IDs;
re-probe at load / 24h. Definitive probe negatives skip; transport/401/
quota keep last-known and **allow playback**.

`NoPlayableItem` only when every candidate has a definitive skip reason,
or the allowlist is empty. Step 4 shows it on confirmation and does not
call `confirmWatching`.

### Manual path is a peer

Same as 03. Saving does not require a refresh token. API key + identity
headers when signed out.

### D-pad text entry

Manual URL field: Android TV IME via RN `TextInput`. Keep it in the 5%
safe area. Do not require a companion-phone type path in v1.

### Failure model

Port 03’s table. Additional:

| Failure                     | Response                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| SecureStore unavailable     | Block Connect; Manual path still works; surface “cannot store Google sign-in on this device” |
| Identity module SHA-1 empty | Treat unexpected 403 as config (register debug cert), not “manual path broken”               |
| `fetch` CORS                | Native `fetch` has no CORS; do not add a browser polyfill that invents one                   |

---

## Decisions already made

- YT-D14–D19. RN-D1–D15. PIN gating from Step 2.

---

## Decisions this step must lock

| ID         | Decision   | Lock                                                                                            |
| ---------- | ---------- | ----------------------------------------------------------------------------------------------- |
| **RN-D16** | HTTP       | `fetch` in `apps/tv`. No OkHttp wrapper unless `fetch` cannot set the Android headers (it can). |
| **RN-D17** | Tokens     | `expo-secure-store` only. Disconnect keeps allowlist.                                           |
| **RN-D18** | Identity   | Native `android-identity` for package + cert SHA-1 on API-key calls.                            |
| **RN-D19** | Catalog DB | Same sqlite file as timer `kv`. New tables; not a second database.                              |

---

## Scope in / Scope out

**In:** OAuth UI, token store, Data API, parser, sqlite allowlist, both
brief screens, named errors, env keys, identity module, QR svg.

**Out:** Player view, IFrame, timer changes, downloading streams,
`vnd.youtube`, `search.list`, channel-URL resolve, `expo-auth-session`.

---

## What this step retires or amends

| Item                                      | Action                                                 |
| ----------------------------------------- | ------------------------------------------------------ |
| Manifest URL / hosted media               | Stay gone                                              |
| WorkManager downloads                     | Stay gone                                              |
| Kotlin EncryptedSharedPreferences adapter | Not built on this track; SecureStore is the equivalent |

---

## Non-negotiables

1. **No YouTube media files on disk.**
2. **Scope stays `youtube.readonly`.**
3. **Manual path works with zero tokens.**
4. **Do not launch the official YouTube app.**
5. **Revoked auth must not delete the allowlist.**
6. **Parser lives in `packages/core`.**

---

## Tests and verification

`packages/core` (this machine): URL matrix from 03; allowlist equality /
id uniqueness.

`apps/tv` (SDK machine, Step 5): SecureStore round-trip; disconnect
clears tokens not sqlite; device-code poll state machine with a mock
HTTP layer (`authorization_pending` → success, `expired_token`,
`access_denied`); 401 then refresh; 403 quota.

Hardware OAuth is Step 5.

---

## Implementation build order

1. `YoutubeUrlParser` + tests in core; `AllowlistEntry`.
2. sqlite tables + repository; Save from a fake list.
3. Env keys in `app.config.ts`.
4. `android-identity`; Data API client with headers.
5. Device-code use case + mock HTTP tests; Connect screen + QR.
6. SecureStore; process-kill restore.
7. Playlists / Subscriptions tabs + 24h cache.
8. Manual tab; PIN-gate Parent settings; wizard not re-prompted.

---

## Open risks

| Risk                                | Mitigation                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| Google blocks TV device-code        | Record as platform auth blocker in Step 5; Manual path still ships                               |
| Restricted key 403 on sideload cert | Register debug SHA-1; identity module must report the cert the APK actually signed with          |
| SecureStore quirks on Android TV    | Step 5 round-trip; if it fails, that is a platform blocker for _account_ connect, not for Manual |
| `expo-image` on TV                  | Listed as supported; fail soft on poster rows                                                    |
