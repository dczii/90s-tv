import type { OEmbedHit } from "./linkHandler";

export async function lookupOEmbed(canonicalUrl: string): Promise<OEmbedHit | null> {
  const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(canonicalUrl)}`;
  const res = await fetch(endpoint);
  if (!res.ok) return null;
  const json = (await res.json()) as {
    title?: unknown;
    thumbnail_url?: unknown;
  };
  const title = typeof json.title === "string" ? json.title.trim() : "";
  const thumbnailUrl =
    typeof json.thumbnail_url === "string" ? json.thumbnail_url : null;
  if (!title && !thumbnailUrl) return null;
  return { title, thumbnailUrl };
}
