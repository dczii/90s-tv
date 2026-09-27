import type { AllowlistError, ParsedYoutubeUrl } from "./types.js";
import { parseYoutubeUrl } from "./youtubeUrlParser.js";

/** Longest pasted text we look at. Share sheets add a sentence, not pages. */
export const LINK_INPUT_MAX_CHARS = 2048;

const URL_IN_TEXT = /(?:https?:\/\/)?(?:[\w-]+\.)*(?:youtube\.com|youtu\.be)\/\S*/i;

/**
 * Pull the YouTube link out of pasted text. Phone share sheets often send
 * "Watch this! https://youtu.be/…"; plain links pass through unchanged.
 */
export function extractYoutubeLink(input: string): string {
  const trimmed = input.trim();
  const match = URL_IN_TEXT.exec(trimmed);
  return match ? match[0] : trimmed;
}

/** Parent-facing copy for a link that cannot be added. */
export function linkErrorMessage(error: AllowlistError): string {
  switch (error.kind) {
    case "Empty":
      return "Paste a YouTube link first.";
    case "MalformedUrl":
      return "That doesn't look like a YouTube video or playlist link.";
    case "UnsupportedHost":
      return "Only YouTube video and playlist links work. Channel links aren't supported.";
    case "NotEmbeddable":
      return "This video can't play on the TV. It may be private, or its owner blocks other apps.";
    case "PrivateBlocked":
      return "This video is private.";
    case "AgeRestricted":
      return "This video is age-restricted.";
    case "RegionRestricted":
      return "This video isn't available in your country.";
    case "Removed":
      return "This video or playlist was removed or doesn't exist.";
    case "NoPlayableItem":
      return "Nothing in this link can be played.";
  }
}

/** Parse pasted phone input into a video or playlist id, or parent copy. */
export function parseLinkInput(
  input: string,
):
  | { ok: true; value: ParsedYoutubeUrl }
  | { ok: false; error: AllowlistError; message: string } {
  const link = extractYoutubeLink(input.slice(0, LINK_INPUT_MAX_CHARS));
  if (!link) {
    const error: AllowlistError = { kind: "Empty" };
    return { ok: false, error, message: linkErrorMessage(error) };
  }
  const parsed = parseYoutubeUrl(link);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, message: linkErrorMessage(parsed.error) };
  }
  return parsed;
}

/** Canonical youtube.com URL for an id (oEmbed lookups, display). */
export function canonicalYoutubeUrl(parsed: ParsedYoutubeUrl): string {
  return parsed.kind === "Video"
    ? `https://www.youtube.com/watch?v=${parsed.id}`
    : `https://www.youtube.com/playlist?list=${parsed.id}`;
}
