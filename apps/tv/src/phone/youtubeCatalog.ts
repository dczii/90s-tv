import type { ShowCard, PhoneCatalog } from "./linkHandler";
import { canonicalYoutubeUrl } from "./linkHandler";
import { ensureAccessToken } from "../youtube/authSession";
import {
  fetchPlaylistMetadata,
  fetchVideoMetadata,
  listMyPlaylists,
  searchShows,
  uploadsPlaylistForChannel,
  youtubeConfig,
  type YoutubeApiError,
} from "../youtube/client";

function failure(error: YoutubeApiError): Error {
  return new Error(error.message || "YouTube could not be reached. Try again.");
}

function card(
  id: string,
  kind: ShowCard["kind"],
  title: string,
  thumbnailUrl: string | null,
  detail: string | null = null,
): ShowCard {
  return {
    id,
    kind,
    title,
    thumbnailUrl,
    url: canonicalYoutubeUrl(kind, id),
    detail,
  };
}

/** YouTube Data API lookups for the phone page. The browser never sees the key. */
export function createPhoneCatalog(): PhoneCatalog {
  const config = youtubeConfig();
  const apiKey = { type: "apiKey" as const };

  return {
    async video(id) {
      const rows = await fetchVideoMetadata([id], apiKey, config.apiKey);
      if (!Array.isArray(rows)) throw failure(rows);
      const row = rows[0];
      if (!row || row.missing) return null;
      let detail: string | null = null;
      if (row.embeddable === false) detail = "This video may not play in LittlePlay.";
      else if (row.privacyStatus && row.privacyStatus !== "public") {
        detail = "This video is not public.";
      }
      return {
        title: row.title || id,
        thumbnailUrl: row.thumbnailUrl,
        detail,
      };
    },

    async playlist(id) {
      const row = await fetchPlaylistMetadata(id, apiKey, config.apiKey);
      if (row && "kind" in row) throw failure(row);
      if (!row) return null;
      return { title: row.title, thumbnailUrl: row.thumbnailUrl, detail: null };
    },

    async channelUploads(target) {
      const row = await uploadsPlaylistForChannel(target, apiKey, config.apiKey);
      if (row && "kind" in row) throw failure(row);
      if (!row) return null;
      return card(row.id, "Playlist", row.title, row.thumbnailUrl);
    },

    async search(query) {
      const rows = await searchShows(query, apiKey, config.apiKey);
      if (!Array.isArray(rows)) throw failure(rows);
      return rows.map((hit) => card(hit.id, hit.kind, hit.title, hit.thumbnailUrl));
    },

    async library() {
      const token = await ensureAccessToken({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
      });
      if (token.status !== "ok") return { connected: false, cards: [] };
      const rows = await listMyPlaylists(token.accessToken, config.apiKey);
      if (!Array.isArray(rows)) throw failure(rows);
      return {
        connected: true,
        cards: rows.map((item) =>
          card(item.id, "Playlist", item.title, item.thumbnailUrl),
        ),
      };
    },
  };
}
