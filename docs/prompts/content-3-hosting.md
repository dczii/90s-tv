# Kickoff prompt — C3 (Host and verify)

Copy everything below the rule into a fresh session on this repo.

---

Work **Phase C3 (Host and verify)** of the Nostalgia Box delivery plan.

**Read first:** `docs/PLAN.md` (Phase C3), `docs/ARCHITECTURE.md` (§2.4, §11).

**Branch:** develop on `claude/nostalgia-box-hosting-<suffix>`, commit, push. No PR.

**Prerequisite:** C2 complete. **C3 must land before P3 starts** — it is where the
content and app tracks meet.

## Decisions assumed

- **D4.** An object store with public read, HTTPS, and **HTTP Range support** (A4).
  Recommended: Cloudflare R2 or Backblaze B2 behind Cloudflare for the free egress;
  S3 and GCS work identically.
- No auth for MVP — a public bucket at an unguessable prefix.

## Scope

Get the manifest and media reachable, and **prove** range requests work.

**Out of scope:** signed URLs, auth, CDN tuning beyond what's needed to serve the files.

## Build

- Upload the C2 output, preserving the `<channelId>/<sha256>.mp4` layout
- `docs/HOSTING.md` — the bucket, the manifest URL, how to re-upload after a C2
  regeneration, and the verification commands below
- Record total footprint and compare against D3

## Non-negotiables

1. **Verify Range support explicitly. Do not assume it.**
   ```
   curl -s -D- -o /dev/null -r 0-1023 https://host/ch1/<sha>.mp4 | head -1
   ```
   Must return `HTTP/1.1 206 Partial Content`. A `200` means the host streamed the whole
   file and ignored the range — resume is impossible and **FR11 cannot pass on this
   host**. Test at least one file per channel, not just the first one you uploaded.
2. **Python's `http.server` does not implement range requests.** It cannot be used to
   test resume locally, and using it will make P3 look like it works when it doesn't.
   Use `nginx`, `caddy file-server`, or `pip install rangehttpserver && python -m RangeHTTPServer`.
3. **Do not put a signed URL in the manifest.** It expires mid-download and breaks the
   content-addressed cache. If auth becomes necessary later, a long-lived bearer token
   on the *manifest fetch only* is the smaller change.
4. **Confirm the objects are genuinely public-read** from an unauthenticated client, not
   from your own session with credentials cached.

## Verification

- `206` for a ranged request against at least one file per channel
- The manifest URL resolves over HTTPS and returns valid JSON
- An interrupted `curl -C -` of a large file resumes rather than restarting
- Fetch from a device or network with no credentials at all

## Exit criteria

- Range verified on all five channels
- Manifest URL live over HTTPS, documented in `docs/HOSTING.md`
- Total footprint recorded and within D3

## Report back

The manifest URL, the verified `206` output, total footprint, and the egress cost model
of the host you chose — first-run provisioning is ~6 GB per device.
