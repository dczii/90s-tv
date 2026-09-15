import {
  androidPackageName,
  signingCertSha1Hex,
} from "android-identity";
import Constants from "expo-constants";
import { PARENT_COPY } from "./errors";

export type YoutubeConfig = {
  apiKey: string;
  clientId: string;
  clientSecret: string;
};

export function youtubeConfig(): YoutubeConfig {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
  return {
    apiKey: extra.youtubeApiKey ?? process.env.YOUTUBE_API_KEY ?? "",
    clientId: extra.youtubeClientId ?? process.env.YOUTUBE_CLIENT_ID ?? "",
    clientSecret:
      extra.youtubeClientSecret ?? process.env.YOUTUBE_CLIENT_SECRET ?? "",
  };
}

export type YoutubeApiError =
  | { kind: "QuotaExceeded"; message: string }
  | { kind: "AuthExpired"; message: string }
  | { kind: "AuthRevoked"; message: string }
  | { kind: "NetworkDown"; message: string }
  | { kind: "HttpError"; status: number; message: string }
  | { kind: "ConfigMissing"; message: string };

export type CatalogItem = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  /** For subscriptions: uploads playlist id */
  uploadsPlaylistId?: string;
};

export type VideoMetadata = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  embeddable: boolean | null;
  privacyStatus: string | null;
  ytAgeRestricted: boolean;
  regionBlocked: boolean;
  missing: boolean;
};

export type AuthMode =
  | { type: "apiKey" }
  | { type: "bearer"; accessToken: string };

export type YoutubeRequestOpts = {
  fetchImpl?: typeof fetch;
  /**
   * Bearer 401: return a fresh access token to retry once, or null to stop.
   * Must not recurse (caller clears / refreshes once).
   */
  refreshAccessTokenOnce?: () => Promise<string | null>;
};

function apiBase(path: string, query: Record<string, string>): string {
  const u = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  return u.toString();
}

async function youtubeFetch(
  path: string,
  query: Record<string, string>,
  auth: AuthMode,
  apiKey: string,
  opts: YoutubeRequestOpts = {},
  allowRetry = true,
): Promise<Response | YoutubeApiError> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const q = { ...query };
  if (auth.type === "bearer") {
    headers.Authorization = `Bearer ${auth.accessToken}`;
  } else {
    if (!apiKey) {
      return {
        kind: "ConfigMissing",
        message: PARENT_COPY.ConfigMissing,
      };
    }
    q.key = apiKey;
    try {
      headers["X-Android-Package"] = androidPackageName();
      headers["X-Android-Cert"] = signingCertSha1Hex();
    } catch {
      // Dev / Node tests: headers optional; restricted keys need them on device
    }
  }

  let res: Response;
  try {
    res = await fetchImpl(apiBase(path, q), { headers });
  } catch {
    return { kind: "NetworkDown", message: PARENT_COPY.NetworkDown };
  }

  if (res.status === 401) {
    if (
      allowRetry &&
      auth.type === "bearer" &&
      opts.refreshAccessTokenOnce
    ) {
      const next = await opts.refreshAccessTokenOnce();
      if (next) {
        return youtubeFetch(
          path,
          query,
          { type: "bearer", accessToken: next },
          apiKey,
          opts,
          false,
        );
      }
    }
    return { kind: "AuthExpired", message: PARENT_COPY.AuthExpired };
  }
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { errors?: Array<{ reason?: string }>; message?: string };
    };
    const reason = body.error?.errors?.[0]?.reason;
    if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
      return {
        kind: "QuotaExceeded",
        message: PARENT_COPY.QuotaExceeded,
      };
    }
    return {
      kind: "HttpError",
      status: 403,
      message: PARENT_COPY.HttpError,
    };
  }
  if (!res.ok) {
    return {
      kind: "HttpError",
      status: res.status,
      message: PARENT_COPY.HttpError,
    };
  }
  return res;
}

function thumbFromSnippet(snippet: Record<string, unknown>): string | null {
  const thumbs = snippet.thumbnails as
    | Record<string, { url?: string }>
    | undefined;
  return (
    thumbs?.medium?.url ??
    thumbs?.default?.url ??
    thumbs?.high?.url ??
    null
  );
}

export async function listMyPlaylists(
  accessToken: string,
  apiKey: string,
  opts: YoutubeRequestOpts = {},
): Promise<CatalogItem[] | YoutubeApiError> {
  const res = await youtubeFetch(
    "playlists",
    { part: "snippet,contentDetails", mine: "true", maxResults: "50" },
    { type: "bearer", accessToken },
    apiKey,
    opts,
  );
  if (!(res instanceof Response)) return res;
  const json = (await res.json().catch(() => ({}))) as {
    items?: Array<{ id?: string; snippet?: Record<string, unknown> }>;
  };
  return (json.items ?? []).map((item) => ({
    id: String(item.id),
    title: String(item.snippet?.title ?? "Playlist"),
    thumbnailUrl: item.snippet ? thumbFromSnippet(item.snippet) : null,
  }));
}

export async function listMySubscriptions(
  accessToken: string,
  apiKey: string,
  opts: YoutubeRequestOpts = {},
): Promise<CatalogItem[] | YoutubeApiError> {
  const res = await youtubeFetch(
    "subscriptions",
    { part: "snippet", mine: "true", maxResults: "50" },
    { type: "bearer", accessToken },
    apiKey,
    opts,
  );
  if (!(res instanceof Response)) return res;
  const json = (await res.json().catch(() => ({}))) as {
    items?: Array<{
      snippet?: {
        title?: string;
        resourceId?: { channelId?: string };
        thumbnails?: Record<string, { url?: string }>;
      };
    }>;
  };

  const out: CatalogItem[] = [];
  for (const item of json.items ?? []) {
    const channelId = item.snippet?.resourceId?.channelId;
    if (!channelId) continue;
    const uploads = await channelUploadsPlaylist(
      channelId,
      { type: "bearer", accessToken },
      apiKey,
      opts,
    );
    if (typeof uploads === "string") {
      out.push({
        id: channelId,
        title: String(item.snippet?.title ?? "Subscription"),
        thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? null,
        uploadsPlaylistId: uploads,
      });
    } else if (uploads && typeof uploads === "object" && "kind" in uploads) {
      if (
        uploads.kind === "QuotaExceeded" ||
        uploads.kind === "AuthExpired" ||
        uploads.kind === "NetworkDown"
      ) {
        return uploads;
      }
    }
  }
  return out;
}

async function channelUploadsPlaylist(
  channelId: string,
  auth: AuthMode,
  apiKey: string,
  opts: YoutubeRequestOpts,
): Promise<string | YoutubeApiError | null> {
  const res = await youtubeFetch(
    "channels",
    { part: "contentDetails", id: channelId },
    auth,
    apiKey,
    opts,
  );
  if (!(res instanceof Response)) return res;
  const json = (await res.json().catch(() => ({}))) as {
    items?: Array<{
      contentDetails?: { relatedPlaylists?: { uploads?: string } };
    }>;
  };
  return json.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null;
}

export async function fetchVideoMetadata(
  ids: string[],
  auth: AuthMode,
  apiKey: string,
  opts: YoutubeRequestOpts = {},
): Promise<VideoMetadata[] | YoutubeApiError> {
  if (ids.length === 0) return [];
  const res = await youtubeFetch(
    "videos",
    {
      part: "snippet,status,contentDetails",
      id: ids.join(","),
    },
    auth,
    apiKey,
    opts,
  );
  if (!(res instanceof Response)) return res;
  const json = (await res.json().catch(() => ({}))) as {
    items?: Array<{
      id?: string;
      snippet?: Record<string, unknown>;
      status?: { embeddable?: boolean; privacyStatus?: string };
      contentDetails?: {
        contentRating?: { ytRating?: string };
        regionRestriction?: { blocked?: string[]; allowed?: string[] };
      };
    }>;
  };
  const byId = new Map((json.items ?? []).map((i) => [String(i.id), i]));
  return ids.map((id) => {
    const item = byId.get(id);
    if (!item) {
      return {
        id,
        title: "",
        thumbnailUrl: null,
        embeddable: null,
        privacyStatus: null,
        ytAgeRestricted: false,
        regionBlocked: false,
        missing: true,
      };
    }
    const region = item.contentDetails?.regionRestriction;
    const regionBlocked = Boolean(
      region?.blocked?.length ||
        (region?.allowed && region.allowed.length === 0),
    );
    return {
      id,
      title: String(item.snippet?.title ?? id),
      thumbnailUrl: item.snippet ? thumbFromSnippet(item.snippet) : null,
      embeddable:
        item.status?.embeddable == null ? null : Boolean(item.status.embeddable),
      privacyStatus: item.status?.privacyStatus ?? null,
      ytAgeRestricted:
        item.contentDetails?.contentRating?.ytRating === "ytAgeRestricted",
      regionBlocked,
      missing: false,
    };
  });
}

export async function fetchPlaylistMetadata(
  playlistId: string,
  auth: AuthMode,
  apiKey: string,
  opts: YoutubeRequestOpts = {},
): Promise<CatalogItem | YoutubeApiError | null> {
  const res = await youtubeFetch(
    "playlists",
    { part: "snippet", id: playlistId },
    auth,
    apiKey,
    opts,
  );
  if (!(res instanceof Response)) return res;
  const json = (await res.json().catch(() => ({}))) as {
    items?: Array<{ id?: string; snippet?: Record<string, unknown> }>;
  };
  const item = json.items?.[0];
  if (!item) return null;
  return {
    id: String(item.id),
    title: String(item.snippet?.title ?? playlistId),
    thumbnailUrl: item.snippet ? thumbFromSnippet(item.snippet) : null,
  };
}

/** playlistItems.list — expand a playlist to video ids (YT-D21: loadVideo only). */
export async function listPlaylistVideoIds(
  playlistId: string,
  auth: AuthMode,
  apiKey: string,
  opts: YoutubeRequestOpts = {},
  maxPages = 5,
): Promise<string[] | YoutubeApiError> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const query: Record<string, string> = {
      part: "contentDetails",
      playlistId,
      maxResults: "50",
    };
    if (pageToken) query.pageToken = pageToken;
    const res = await youtubeFetch("playlistItems", query, auth, apiKey, opts);
    if (!(res instanceof Response)) return res;
    const json = (await res.json().catch(() => ({}))) as {
      nextPageToken?: string;
      items?: Array<{ contentDetails?: { videoId?: string } }>;
    };
    for (const item of json.items ?? []) {
      const videoId = item.contentDetails?.videoId;
      if (videoId) ids.push(videoId);
    }
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  return ids;
}
