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

export type YoutubeChoice = {
  id: string;
  kind: AllowlistKind;
};

/** What the phone page should do with text from the paste field. */
export type YoutubeInput =
  | { kind: "search"; query: string }
  | {
      kind: "channel";
      handle: string | null;
      channelId: string | null;
      username: string | null;
    }
  | { kind: "choices"; choices: YoutubeChoice[] }
  | { kind: "error"; message: string };

const NOT_A_LINK = "Paste a YouTube link or type a show name.";
const ONLY_YOUTUBE = "Only YouTube video and playlist links can be added.";
const UNSTABLE_LIST =
  "That list changes on its own. Paste a video or a playlist you saved.";
const CUSTOM_CHANNEL = "Paste a video or playlist from that channel.";

type ReadTarget =
  | { kind: "bad" }
  | { kind: "foreign" }
  | { kind: "custom" }
  | {
      kind: "channel";
      handle: string | null;
      channelId: string | null;
      username: string | null;
    }
  | { kind: "media"; videoId: string | null; playlistId: string | null };

/** Mixes, Watch Later, and Likes are not a show a parent can keep. */
export function unstablePlaylistId(id: string): boolean {
  return id === "WL" || id === "LL" || id.startsWith("RD");
}

function stripTrail(url: string): string {
  return url.replace(/[),.;]+$/g, "");
}

/** First YouTube URL inside share text. A title on its own line is ignored. */
export function extractYoutubeUrl(input: string): string | null {
  const http = input.match(/https?:\/\/[^\s<>"']+/i);
  if (http?.[0]) return stripTrail(http[0]);
  const bare = input.match(
    /(?:www\.)?(?:music\.)?(?:youtube\.com|youtu\.be)\/[^\s<>"']+/i,
  );
  if (bare?.[0]) return stripTrail(bare[0]);
  return null;
}

function readTarget(input: string): ReadTarget {
  const normalized = normalizeInput(input);
  if (!normalized) return { kind: "bad" };

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return { kind: "bad" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { kind: "bad" };

  const host = url.hostname.toLowerCase();
  if (!isYoutubeHost(host)) return { kind: "foreign" };

  const path = url.pathname.replace(/\/+$/, "") || "/";
  const segments = path.split("/").filter(Boolean);
  const head = segments[0] ?? "";

  if (head.startsWith("@")) {
    return {
      kind: "channel",
      handle: head.slice(1),
      channelId: null,
      username: null,
    };
  }
  if (head === "channel" && segments[1]) {
    return {
      kind: "channel",
      handle: null,
      channelId: segments[1],
      username: null,
    };
  }
  if (head === "user" && segments[1]) {
    return {
      kind: "channel",
      handle: null,
      channelId: null,
      username: segments[1],
    };
  }
  if (head === "c" || head === "clip") return { kind: "custom" };

  if (stripWww(host) === "youtu.be") {
    const id = segments[0] ?? "";
    if (!videoIdOk(id)) return { kind: "bad" };
    return { kind: "media", videoId: id, playlistId: null };
  }

  const list = url.searchParams.get("list");
  const playlistId = list && playlistIdOk(list) ? list : null;

  if (head === "playlist") {
    if (!playlistId) return { kind: "bad" };
    return { kind: "media", videoId: null, playlistId };
  }

  if (head === "watch" || path === "/") {
    const v = url.searchParams.get("v");
    const videoId = v && videoIdOk(v) ? v : null;
    if (!videoId && !playlistId) return { kind: "bad" };
    if (v && !videoId) return { kind: "bad" };
    return { kind: "media", videoId, playlistId };
  }

  if (
    (head === "shorts" || head === "embed" || head === "live" || head === "v") &&
    segments[1] &&
    videoIdOk(segments[1])
  ) {
    return { kind: "media", videoId: segments[1], playlistId: null };
  }

  return { kind: "bad" };
}

function choicesFromMedia(
  videoId: string | null,
  playlistId: string | null,
): YoutubeChoice[] {
  const choices: YoutubeChoice[] = [];
  if (playlistId && !unstablePlaylistId(playlistId)) {
    choices.push({ id: playlistId, kind: "Playlist" });
  }
  if (videoId) choices.push({ id: videoId, kind: "Video" });
  return choices;
}

/**
 * Pure YouTube URL parser (YT-D17). WHATWG URL only — never react-native.
 * A watch URL that also has a playlist keeps the video, matching the old rule.
 */
export function parseYoutubeUrl(
  input: string,
):
  | { ok: true; value: ParsedYoutubeUrl }
  | { ok: false; error: Extract<AllowlistError, { kind: "MalformedUrl" | "UnsupportedHost" }> } {
  const read = readTarget(input);
  if (read.kind === "foreign" || read.kind === "custom" || read.kind === "channel") {
    return { ok: false, error: { kind: "UnsupportedHost", input } };
  }
  if (read.kind !== "media") {
    return { ok: false, error: { kind: "MalformedUrl", input } };
  }
  if (read.videoId) {
    return { ok: true, value: { id: read.videoId, kind: "Video" } };
  }
  if (read.playlistId && !unstablePlaylistId(read.playlistId)) {
    return { ok: true, value: { id: read.playlistId, kind: "Playlist" } };
  }
  return { ok: false, error: { kind: "MalformedUrl", input } };
}

/** Phone-page input: a show name, a channel, or one or two addable ids. */
export function classifyYoutubeInput(input: string): YoutubeInput {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "error", message: NOT_A_LINK };

  const extracted = extractYoutubeUrl(trimmed);
  if (!extracted) {
    if (/https?:\/\//i.test(trimmed)) {
      return { kind: "error", message: ONLY_YOUTUBE };
    }
    return { kind: "search", query: trimmed.slice(0, 100) };
  }

  const read = readTarget(extracted);
  if (read.kind === "foreign") return { kind: "error", message: ONLY_YOUTUBE };
  if (read.kind === "custom") return { kind: "error", message: CUSTOM_CHANNEL };
  if (read.kind === "channel") {
    return {
      kind: "channel",
      handle: read.handle,
      channelId: read.channelId,
      username: read.username,
    };
  }
  if (read.kind !== "media") return { kind: "error", message: NOT_A_LINK };

  const choices = choicesFromMedia(read.videoId, read.playlistId);
  if (choices.length === 0) return { kind: "error", message: UNSTABLE_LIST };
  return { kind: "choices", choices };
}
