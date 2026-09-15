import type { AllowlistError, AllowlistKind, ParsedYoutubeUrl } from "./types.js";

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

function stripWww(host: string): string {
  return host.replace(/^www\./, "");
}

function isYoutubeHost(host: string): boolean {
  const h = host.toLowerCase();
  return YOUTUBE_HOSTS.has(h) || YOUTUBE_HOSTS.has(stripWww(h));
}

function normalizeInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function videoIdOk(id: string): boolean {
  return /^[\w-]{11}$/.test(id);
}

function playlistIdOk(id: string): boolean {
  return /^[\w-]+$/.test(id) && id.length >= 2;
}

/**
 * Pure YouTube URL parser (YT-D17). WHATWG URL only — never react-native.
 */
export function parseYoutubeUrl(
  input: string,
):
  | { ok: true; value: ParsedYoutubeUrl }
  | { ok: false; error: Extract<AllowlistError, { kind: "MalformedUrl" | "UnsupportedHost" }> } {
  const normalized = normalizeInput(input);
  if (!normalized) {
    return { ok: false, error: { kind: "MalformedUrl", input } };
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return { ok: false, error: { kind: "MalformedUrl", input } };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: { kind: "MalformedUrl", input } };
  }

  const host = url.hostname.toLowerCase();
  if (!isYoutubeHost(host)) {
    return { ok: false, error: { kind: "UnsupportedHost", input } };
  }

  const path = url.pathname.replace(/\/+$/, "") || "/";
  const segments = path.split("/").filter(Boolean);

  // Channel / clip rejects
  if (
    segments[0]?.startsWith("@") ||
    segments[0] === "channel" ||
    segments[0] === "c" ||
    segments[0] === "user" ||
    segments[0] === "clip"
  ) {
    return { ok: false, error: { kind: "UnsupportedHost", input } };
  }

  // youtu.be/{id}
  if (stripWww(host) === "youtu.be") {
    const id = segments[0] ?? "";
    if (!videoIdOk(id)) {
      return { ok: false, error: { kind: "MalformedUrl", input } };
    }
    return { ok: true, value: { id, kind: "Video" } };
  }

  // /playlist?list=
  if (segments[0] === "playlist") {
    const list = url.searchParams.get("list");
    if (!list || !playlistIdOk(list)) {
      return { ok: false, error: { kind: "MalformedUrl", input } };
    }
    return { ok: true, value: { id: list, kind: "Playlist" } };
  }

  // /watch?v= — v wins even when list= is present
  if (segments[0] === "watch" || path === "/" || path === "") {
    const v = url.searchParams.get("v");
    if (v) {
      if (!videoIdOk(v)) {
        return { ok: false, error: { kind: "MalformedUrl", input } };
      }
      return { ok: true, value: { id: v, kind: "Video" } };
    }
    const list = url.searchParams.get("list");
    if (list && playlistIdOk(list)) {
      return { ok: true, value: { id: list, kind: "Playlist" } };
    }
    return { ok: false, error: { kind: "MalformedUrl", input } };
  }

  // /shorts/{id}, /embed/{id}, /live/{id}
  if (
    (segments[0] === "shorts" ||
      segments[0] === "embed" ||
      segments[0] === "live" ||
      segments[0] === "v") &&
    segments[1]
  ) {
    const id = segments[1];
    if (!videoIdOk(id)) {
      return { ok: false, error: { kind: "MalformedUrl", input } };
    }
    return { ok: true, value: { id, kind: "Video" as AllowlistKind } };
  }

  return { ok: false, error: { kind: "MalformedUrl", input } };
}
