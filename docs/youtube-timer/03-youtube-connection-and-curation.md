# Step 3 — YouTube connection and content curation

**Parent:** [LittlePlay — Five-Step Plan](../YOUTUBE_TIMER_PLAN.md) §3
**Status:** blocked on Step 2 (`TimerEngine` + PIN gate). After
`completeSetup` the phase is `AwaitingConfirmation`. First-run Connect
YouTube and the content picker still run as the setup wizard (parent
holds the remote); Continue watching stays disabled until the allowlist
is non-empty. After the wizard, those screens are PIN-gated from Parent
settings.
**Produces:** device-code OAuth, Keystore-backed tokens, Data API reads,
`:core` allowlist + URL parser, Room allowlist, Connect YouTube and Choose
allowed content screens. No player.

---

## Goal

Let a parent persist a playable allowlist of YouTube **IDs and metadata**,
either from a `youtube.readonly` TV OAuth session or from public URLs typed
on the D-pad. The two paths write the same Room table. Nothing in this step
fetches video bytes.

---

## Exit criterion

Copied from the parent plan and sharpened:

- [ ] Device-code flow (RFC 8628) shows the verification URL and user
      code; a successful poll stores access + refresh tokens in
      EncryptedSharedPreferences (Keystore-backed). Scope is only
      `https://www.googleapis.com/auth/youtube.readonly`.
- [ ] Parent can select playlists and subscriptions from the account, and
      persist them as `AllowlistEntry` rows.
- [ ] With **no** account, parent can add public video and playlist URLs;
      they persist in the same table with `source = ManualUrl`.
- [ ] Relaunch restores the allowlist and, if tokens exist, the signed-in
      state without repeating the user-code screen.
- [ ] Expired auth, revoked access, quota, unavailable, and not-embeddable
      have named errors and parent-visible copy. An empty or fully
      unplayable allowlist disables Continue watching (Step 4); it does
      not crash.
- [ ] No file under app storage is a YouTube media body. Grep/cache
      inspection shows IDs, titles, thumbnail URLs only.

---

## Read first

- [01-product-and-timer-rules.md](01-product-and-timer-rules.md)
- [02-persistent-timer-and-parent-controls.md](02-persistent-timer-and-parent-controls.md)
  (PIN gates connect/disconnect and content from Parent settings; wizard
  Connect/picker after `completeSetup` are not re-prompted. DataStore is
  already taken for timer/PIN)
- [DESIGN_BRIEF.md](../../designs/DESIGN_BRIEF.md) — Connect YouTube,
  Choose allowed content
- Google: OAuth 2.0 for TVs and Limited Input Device Applications;
  YouTube Data API v3 `playlists`, `playlistItems`, `subscriptions`,
  `channels`, `videos`

---

## Product / user-visible outcome

**Connect YouTube.** Large user code, verification URL, optional QR of
that URL (local encoder in `:app`, e.g. ZXing — no network QR service),
read-only permission sentence, **Use links instead** as a real
secondary action (not a footnote). PIN-gated when entered from Parent
settings; **not** re-prompted during the first-run wizard.

**Choose allowed content.** Tabs: Playlists, Subscriptions, Manual link.
Poster rows with check state, persistent selected count, **Save allowed
content**. Manual tab is the on-screen keyboard URL field plus the same
card list. D-pad-first, 5% safe area.

Continue watching stays disabled while the saved allowlist is empty.

---

## Technical design

### Device-code OAuth (RFC 8628)

Client is a Google Cloud OAuth client of type **TVs and Limited Input
devices**. Do not use a Web or Android installed-app client; those flows
need a browser we do not have.

```
POST https://oauth2.googleapis.com/device/code
  client_id, scope=https://www.googleapis.com/auth/youtube.readonly

→ device_code, user_code, verification_url, expires_in, interval

Poll POST https://oauth2.googleapis.com/token
  client_id, client_secret, device_code,
  grant_type=urn:ietf:params:oauth:grant-type:device_code
```

Poll at `interval` seconds. Map token-endpoint errors:

| Token error | Named | UI |
|---|---|---|
| `authorization_pending` | (not an error) | keep polling |
| `slow_down` | (not an error) | increase interval by 5s |
| `expired_token` | `AuthDeviceCodeExpired` | regenerate code |
| `access_denied` | `AuthDenied` | “You cancelled on Google” |
| HTTP 403 / `invalid_grant` on refresh | `AuthRevoked` | force disconnect, keep allowlist |
| HTTP 401 on Data API | try refresh once, then `AuthExpired` | reconnect |

Show `verification_url` + `user_code`. QR encodes `verification_url`
(or the complete-URL Google returns if present) with a **local** encoder
in `:app` (ZXing or equivalent). No network QR service. Cancel stops
polling and does not write tokens.

Rejected: looping a WebView through accounts.google.com (not the TV
flow, fragile, over-scope risk). Rejected: `yt-dlp` / embedded
password fields.

`:app` owns HTTP, polling, and UI. `:core` owns nothing of OAuth —
tokens are Android Keystore material.

### Token storage

**EncryptedSharedPreferences** with a `MasterKey` (AES256-GCM,
Android Keystore). Keys: `access_token`, `refresh_token`,
`access_expiry_wall_ms`, `token_type`.
`androidx.security:security-crypto` is deprecated upstream; keep it at
minSdk 24 (no EncryptedSharedPreferences successor that fits this
constraint). Residual: `client_secret` in the TV OAuth client is
extractable from the APK, same class as the restricted API key.

Rejected: Preferences DataStore for tokens (no Keystore). Rejected:
storing the refresh token in Room next to titles. Rejected: wrapping
the PIN in Keystore (Step 2: verifier, not a secret).

Disconnect: delete the encrypted prefs, revoke via
`https://oauth2.googleapis.com/revoke` best-effort, **keep** the
allowlist (manual rows and previously chosen IDs still play). Parent
can prune in the content screen.

### Data API calls (read-only)

| Job | Endpoint |
|---|---|
| List my playlists | `playlists.list` `mine=true` `part=snippet,contentDetails` |
| Playlist items | `playlistItems.list` `part=snippet,status` paginated |
| Subscriptions | `subscriptions.list` `mine=true` `part=snippet` |
| Channel uploads playlist | `channels.list` `part=contentDetails` → `relatedPlaylists.uploads` |
| Video metadata / playability | `videos.list` `part=snippet,status,contentDetails` `id=` |

Fields we persist from `videos.list`: title, thumbnail URL (`medium`),
`status.embeddable`, `status.privacyStatus`,
`contentDetails.contentRating.ytRating` (`ytAgeRestricted`),
`contentDetails.regionRestriction`.

Do not call `search.list` in v1 (quota). Browsing a subscription is
the uploads playlist, not a search box.

Quota: treat HTTP 403 `quotaExceeded` as `QuotaExceeded`. Freeze the
picker’s last successful fetch; do not empty the allowlist.

A selected **subscription** persists as **one**
`AllowlistEntry(kind = Playlist)` whose id is
`relatedPlaylists.uploads` from `channels.list`. It is not a special
subscription row. At probe/play, Step 4 expands it like any other
playlist (`playlistItems.list`, then per-video probe) and plays with
`loadVideo` only.

### Allowlist model (`:core`)

```kotlin
enum class AllowlistKind { Video, Playlist }
enum class AllowlistSource { Account, ManualUrl }

data class AllowlistEntry(
    val id: String,                 // YouTube video or playlist id
    val kind: AllowlistKind,
    val title: String,
    val thumbnailUrl: String?,
    val embeddable: Boolean?,       // null = unknown (playlist, or not yet probed)
    val source: AllowlistSource,
    val addedAtWallMs: Long,
)

sealed class AllowlistError {
    data object Empty : AllowlistError()
    data class MalformedUrl(val input: String) : AllowlistError()
    data class UnsupportedHost(val input: String) : AllowlistError()
    data class NotEmbeddable(val videoId: String) : AllowlistError()
    data class PrivateBlocked(val videoId: String) : AllowlistError()
    data class AgeRestricted(val videoId: String) : AllowlistError()
    data class RegionRestricted(val videoId: String) : AllowlistError()
    data class Removed(val videoId: String) : AllowlistError()
    data object NoPlayableItem : AllowlistError()
}
```

IDs + metadata only. No `uri` to a local file, no `sha256`, no
`durationMs` used as a timeline (duration is the timer, not the video).

**Room** (`:app`): `allowlist_entries(id PK, kind, title, thumbnail_url,
embeddable, source, added_at_wall_ms, last_probed_wall_ms)`. Observe as
`Flow<List<AllowlistEntry>>`.

Rejected: DataStore JSON blob (Step 2 already locked DataStore for the
tiny timer document; lists want rows). Rejected: downloading thumbnails
into files — Coil/Glide URL load at display time, fail soft.

### URL parser (`:core`, pure)

Accept, extract id + kind:

| Shape | Kind |
|---|---|
| `https://youtu.be/{id}` | Video |
| `https://www.youtube.com/watch?v={id}` | Video (`v=` wins over other params) |
| `https://www.youtube.com/shorts/{id}` | Video |
| `https://www.youtube.com/embed/{id}` | Video |
| `https://www.youtube.com/live/{id}` | Video |
| `https://www.youtube.com/playlist?list={id}` | Playlist |
| `https://www.youtube.com/watch?v={vid}&list={pid}` | **Video** `vid` (the thing they pasted a timestamp on). Parent can paste the playlist URL separately. |
| `http://`, `m.youtube.com`, `music.youtube.com`, no scheme | Same rules after normalize |

Reject: channel URLs (`/@name`, `/channel/`, `/c/`, `/user/`) — v1 has
no channel-id resolve without search quota. Reject: `youtube.com/clip/`.
Named `UnsupportedHost` vs `MalformedUrl`.

Parser tests live in `:core` and run here without an SDK. The parser uses
`java.net.URI` and strings only — **never** `android.net.Uri` (`:core` is
JVM-only).

### Cache / staleness

Picker lists (playlists, subscriptions) cache in memory + a Room table
`yt_catalog_cache(kind TEXT PK, payload_json, fetched_at_wall_ms)` with
TTL **24 hours**. PK is `kind` only (one concatenated payload per catalog
kind: playlists vs subscriptions). Open picker: if TTL valid, show cache
and refresh in background; if not, spinner + fetch. Playback **does not**
block on a refresh; it uses last-known allowlist IDs.

Re-probe `videos.list` for an ID when `last_probed_wall_ms` is older
than 24h **or** at the moment Step 4 is about to load it.

### Playability skip policy (shared with Step 4)

Split probe outcomes. Do not treat transport the same as “cannot play”:

| Probe outcome | What | Effect |
|---|---|---|
| Definitive negative | `embeddable == false`; `privacyStatus == private`; `ytAgeRestricted`; regionRestriction includes the device country (or `blocked` all); `videos.list` `items` missing that id (HTTP 404/410 or empty items) | Mark skip for this session. Do not delete the row. Missing id ⇒ `Removed`. |
| Soft / keep last-known | Transport error, HTTP 401 after refresh, `quotaExceeded` | Keep last-known flags; **allow playback**; IFrame errors 2/5/100/101/150 are the runtime net (Step 4). |
| Unlisted | On the allowlist (parent pasted it) | Allowed. Not a skip. Signed-out private vs removed are indistinguishable — one parent string: “no longer available”. |

`NoPlayableItem` only when every candidate has a **definitive** skip
reason, or the allowlist is empty. Soft failures do not produce
`NoPlayableItem` by themselves. Step 4 shows `NoPlayableItem` on
confirmation and does **not** call `confirmWatching`.

Playlists (including a selected subscription stored as
`AllowlistKind.Playlist` / uploads): persist the playlist id. At
probe/play, `playlistItems.list` then per-video probe. Cursor is
`(entryId, playlistItemIndex)` and skip walks **video ids**. Step 4
plays with `loadVideo` only — no `loadPlaylist`.

### Manual path is a peer

`AllowlistSource.ManualUrl` is a first-class tab, not a fallback error
state. A device with no tokens must complete curation. A device with
tokens may mix account rows and manual rows in one table. Saving does
not require `refresh_token != null`.

### Failure model

| Failure | Response |
|---|---|
| Device code expires | New code; do not leave a half-token |
| Parent denies on phone | `AuthDenied`; stay signed out; Manual still works |
| Refresh revoked | `AuthRevoked`; clear tokens; keep allowlist; banner on picker |
| Quota | `QuotaExceeded`; stale catalog OK; cannot add new account items until reset |
| Video not embeddable | Keep row; skip at play; count toward `NoPlayableItem` if all skip |
| Probe transport / 401 / `quotaExceeded` | Keep last-known flags; allow playback; IFrame 2/5/100/101/150 are the runtime net |
| `videos.list` missing id in `items` | `Removed`; definitive skip |
| Network down at picker | Show cache or empty with retry; do not wipe Room |
| Malformed URL | Stay on Manual tab with `MalformedUrl` copy |

### Important flows

**Account (Parent settings path).** PIN → Connect → user code → poll →
tokens encrypted → playlists/subs load → checks → Save → Room. A
checked subscription becomes one `AllowlistEntry(kind = Playlist)` with
`relatedPlaylists.uploads`. Later launch: tokens decrypt, skip
user-code, picker from cache.

**Account (first-run wizard).** Same Connect + picker **without** a PIN
prompt (`completeSetup` already ran at Timer-setup Save).

**No account.** Use links instead → Manual tab → parser →
`videos.list` / `playlists.list` by id. Private URLs fail probe; show
the single “no longer available” string (`Removed` / `PrivateBlocked`).

Unauthenticated Data API calls need a key. **Lock: `YOUTUBE_API_KEY` in
`local.properties` → `BuildConfig`, restricted to the YouTube Data API
plus this app’s package and SHA-1.** OkHttp must send `X-Android-Package`
and `X-Android-Cert` (SHA-1 hex of the signing cert) on those requests or
a restricted key 403s. Register the **debug** signing SHA-1 for Step 5
sideload. Use the OAuth access token when present; use the API key when
signed out. Rejected: `youtube.com/oembed` as a metadata path — it has
no `embeddable` flag, so the skip policy cannot run. Quota exhaustion
is `QuotaExceeded` plus stale cache, not a scrape fallback.

---

## Decisions already made

- Minimum scope `youtube.readonly`. Refresh credentials encrypted with
  Android Keystore.
- Manual public video/playlist URLs with no account.
- Allowlist is IDs + metadata, not files.
- PIN gates connect/disconnect and content management from Parent
  settings (Step 2). Wizard Connect/picker are not re-prompted.
- Skip embedding-disabled / private / age-restricted / region-restricted
  / removed at play time on **definitive** probe negatives (Step 4
  executes; this step stores the flags). Soft probe failures keep
  last-known and allow playback.

---

## Decisions this step must lock

| ID | Decision | Lock |
|---|---|---|
| **YT-D14** | TV OAuth | RFC 8628 device-code, `youtube.readonly` only, TVs-and-limited-input client. |
| **YT-D15** | Token storage | EncryptedSharedPreferences + MasterKey. Disconnect revokes best-effort, keeps allowlist. |
| **YT-D16** | Allowlist | `AllowlistEntry` in `:core`; Room in `:app`. Video or playlist IDs. A selected subscription is one `Playlist` row (`relatedPlaylists.uploads`). Expand + `loadVideo` at play (Step 4); do not `loadPlaylist`. |
| **YT-D17** | URL parser | Table above, pure `:core`, `java.net.URI` / strings only (never `android.net.Uri`). Watch+list → video id. No channel URLs in v1. |
| **YT-D18** | Cache | 24h catalog TTL; PK = `kind`; playback uses last-known IDs; re-probe at load / 24h. Definitive probe negatives skip; transport/401/quota keep last-known. |
| **YT-D19** | Manual path | Peer tab, same table, API key for public metadata when signed out. OkHttp sends `X-Android-Package` + `X-Android-Cert`. |

---

## Scope in / Scope out

**In:** OAuth device-code UI, token store, Data API, parser, Room
allowlist, both brief screens, named errors, API key + client secrets
via `local.properties` (not committed).

**Out:** WebView player, IFrame, timer changes, downloading streams,
launching `vnd.youtube`, `search.list`, channel-URL resolve.

---

## What this step retires or amends

| Item | Action |
|---|---|
| Manifest URL, `ManifestParser`, hosted media | Already deleted in Step 2; do not resurrect as “YouTube backup” |
| WorkManager channel downloads | Stay gone |
| Room `files` / `channels` | Never added; Room begins at `allowlist_entries` |
| PRD “offline after provisioning” | Replaced: playback needs network; allowlist metadata is local |

---

## Non-negotiables

1. **No YouTube media files on disk.** Thumbnails may hit the HTTP
   image cache; that is not a download engine.
2. **Scope stays `youtube.readonly`.** Uploading, writing playlists, or
   YouTube TV login is out.
3. **Manual path works with zero tokens.** If Connect is broken, links
   still save.
4. **Do not launch the official YouTube app** to “help” sign-in
   (`Intent` to `vnd.youtube` / `youtube.com`).
5. **Revoked auth must not delete the allowlist.**
6. **Parser lives in `:core`** so Step 5’s URL tests run without an SDK.

---

## Tests and verification

`:core` (this machine): URL matrix (watch, youtu.be, shorts, embed,
live, playlist, watch+list, m., music., schemeless, channel reject,
garbage). Allowlist equality / id uniqueness.

`:app` (SDK machine, Step 5): EncryptedSharedPreferences round-trip;
disconnect clears tokens not Room; device-code poll state machine with
MockWebServer (`authorization_pending` → success, `expired_token`,
`access_denied`); 401 then refresh; 403 quota.

Hardware OAuth is Step 5.

---

## Implementation build order

1. `YoutubeUrlParser` + tests in `:core`; `AllowlistEntry`.
2. Room + repository; Save from a fake list.
3. API key / OAuth client from `local.properties`.
4. Device-code use case + MockWebServer tests; Connect screen.
5. Encrypted token store; process-kill restore.
6. Data API + 24h cache; Playlists / Subscriptions tabs.
7. Manual tab wired to parser + public `videos.list`.
8. PIN-gate Parent settings entries; first-run wizard Connect/picker
   after Timer-setup Save is **not** PIN-gated.

---

## Open risks

| Risk | Mitigation |
|---|---|
| Google blocks TV device-code for the project (branding / verification) | Record as platform auth blocker in Step 5; Manual path still ships; do not pivot to password scraping |
| Data API quota too small for subscription expansion | Paginate conservatively; cache 24h; skip `search.list` |
| API key in the APK is extractable | Restrict by package + SHA-1; send `X-Android-Package` / `X-Android-Cert`; no write scope; residual |
| Restricted key 403s manual path on an unregistered sideload cert | Register debug SHA-1 before Step 5 sideload; treat unexpected 403 as config, not “manual path broken” |
| `client_secret` extractable from the TV OAuth client | Residual, same class as the API key; readonly scope; do not pretend it is confidential |
| Unlisted/private pasted URLs fail without OAuth | Expected; copy says public links or connect an account that can see them. Signed-out private vs removed: one “no longer available” string |
