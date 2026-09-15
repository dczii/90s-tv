import {
  androidPackageName,
  signingCertSha1Hex,
} from "android-identity";
import Constants from "expo-constants";

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

type AuthMode =
  | { type: "apiKey" }
  | { type: "bearer"; accessToken: string };

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
  fetchImpl: typeof fetch = fetch,
): Promise<Response | YoutubeApiError> {
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
        message: "YOUTUBE_API_KEY is not configured",
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
  const res = await fetchImpl(apiBase(path, q), { headers });
  if (res.status === 401) {
    return { kind: "AuthExpired", message: "YouTube API 401" };
  }
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { errors?: Array<{ reason?: string }>; message?: string };
    };
    const reason = body.error?.errors?.[0]?.reason;
    if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
      return {
        kind: "QuotaExceeded",
        message: body.error?.message ?? "YouTube quota exceeded",
      };
    }
    return {
      kind: "HttpError",
      status: 403,
      message: body.error?.message ?? "YouTube API 403",
    };
  }
  if (!res.ok) {
    return {
      kind: "HttpError",
      status: res.status,
      message: `YouTube API ${res.status}`,
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
  fetchImpl: typeof fetch = fetch,
): Promise<CatalogItem[] | YoutubeApiError> {
  const res = await youtubeFetch(
    "playlists",
    { part: "snippet,contentDetails", mine: "true", maxResults: "50" },
    { type: "bearer", accessToken },
    apiKey,
    fetchImpl,
  );
  if (!(res instanceof Response)) return res;
  const json = (await res.json()) as {
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
  fetchImpl: typeof fetch = fetch,
): Promise<CatalogItem[] | YoutubeApiError> {
  const res = await youtubeFetch(
    "subscriptions",
    { part: "snippet", mine: "true", maxResults: "50" },
    { type: "bearer", accessToken },
    apiKey,
    fetchImpl,
  );
  if (!(res instanceof Response)) return res;
  const json = (await res.json()) as {
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
      fetchImpl,
    );
    if (typeof uploads === "string") {
      out.push({
        id: channelId,
        title: String(item.snippet?.title ?? "Subscription"),
        thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? null,
        uploadsPlaylistId: uploads,
      });
    } else if (uploads && typeof uploads === "object" && "kind" in uploads) {
      // Propagate first hard API error (quota / auth)
      if (uploads.kind === "QuotaExceeded" || uploads.kind === "AuthExpired") {
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
  fetchImpl: typeof fetch,
): Promise<string | YoutubeApiError | null> {
  const res = await youtubeFetch(
    "channels",
    { part: "contentDetails", id: channelId },
    auth,
    apiKey,
    fetchImpl,
  );
  if (!(res instanceof Response)) return res;
  const json = (await res.json()) as {
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
  fetchImpl: typeof fetch = fetch,
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
    fetchImpl,
  );
  if (!(res instanceof Response)) return res;
  const json = (await res.json()) as {
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
  fetchImpl: typeof fetch = fetch,
): Promise<CatalogItem | YoutubeApiError | null> {
  const res = await youtubeFetch(
    "playlists",
    { part: "snippet", id: playlistId },
    auth,
    apiKey,
    fetchImpl,
  );
  if (!(res instanceof Response)) return res;
  const json = (await res.json()) as {
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

export type { AuthMode };
