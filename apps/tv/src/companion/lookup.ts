import { canonicalYoutubeUrl, type ParsedYoutubeUrl } from "@littleplay/core";
import type { LinkLookup } from "./handler";

const TIMEOUT_MS = 6000;

/** Only ytimg thumbnails: the phone page CSP allows nothing else. */
function safeThumb(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = /^https?:\/\/i\d?\.ytimg\.com(\/[^\s"'<>]*)$/.exec(raw);
  return m ? `https://i.ytimg.com${m[1]}` : null;
}

/**
 * Title and thumbnail for a pasted link via YouTube oEmbed. No API key, so it
 * works in catalog mode. oEmbed refuses videos whose owner disabled
 * embedding (401/403), which is exactly the set the TV player can't play.
 */
export async function lookupLink(
  parsed: ParsedYoutubeUrl,
  fetchImpl: typeof fetch = fetch,
): Promise<LinkLookup> {
  const url =
    "https://www.youtube.com/oembed?format=json&url=" +
    encodeURIComponent(canonicalYoutubeUrl(parsed));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (res.status === 401 || res.status === 403) {
      return {
        kind: "blocked",
        error:
          parsed.kind === "Video"
            ? { kind: "NotEmbeddable", videoId: parsed.id }
            : { kind: "PrivateBlocked", videoId: parsed.id },
      };
    }
    if (res.status === 400 || res.status === 404) {
      return { kind: "blocked", error: { kind: "Removed", videoId: parsed.id } };
    }
    if (!res.ok) return { kind: "unknown" };
    const body = (await res.json()) as { title?: unknown; thumbnail_url?: unknown };
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return { kind: "unknown" };
    return { kind: "ok", title, thumbnailUrl: safeThumb(body.thumbnail_url) };
  } catch {
    return { kind: "unknown" };
  } finally {
    clearTimeout(timer);
  }
}
