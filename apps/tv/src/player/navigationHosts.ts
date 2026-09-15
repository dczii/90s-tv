/**
 * Host allowlist for WebView navigations (YT-D20).
 * Kept as pure TS so Step 5 can unit-test without a device.
 * Must stay in sync with YoutubePlayerView.ALLOWED_HOST_SUFFIXES.
 *
 * Do not add media CDN hosts here — that would trip the Step 5 grep gate.
 */
export const NAVIGATION_HOST_SUFFIXES = [
  "appassets.androidplatform.net",
  "youtube.com",
  "youtu.be",
  "google.com",
  "ytimg.com",
  "gstatic.com",
] as const;

export function isAllowedNavigationHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  return NAVIGATION_HOST_SUFFIXES.some(
    (suffix) => h === suffix || h.endsWith(`.${suffix}`),
  );
}
