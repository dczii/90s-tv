import {
  REST_MAX_MS,
  REST_MIN_MS,
  WATCH_MAX_MS,
  WATCH_MIN_MS,
  linkErrorMessage,
  parseLinkInput,
  type AllowlistEntry,
  type AllowlistError,
  type AllowlistKind,
  type ParsedYoutubeUrl,
  type TimerSnapshot,
} from "@littleplay/core";
import type { PresetItem } from "../content/presetPlaylists";
import { companionPageHtml } from "./page";

/** One HTTP request as the native server hands it over. */
export type CompanionRequest = {
  method: string;
  path: string;
  /** Raw query string without the leading "?". */
  query: string;
  body: string;
};

export type CompanionResponse = {
  status: number;
  contentType: string;
  body: string;
  headers?: Record<string, string>;
};

export type LinkLookup =
  | { kind: "ok"; title: string; thumbnailUrl: string | null }
  | { kind: "blocked"; error: AllowlistError }
  /** Offline or YouTube did not answer: add with a placeholder title. */
  | { kind: "unknown" };

/** What the TV panel shows as "just happened". */
export type CompanionActivity =
  | { kind: "connected" }
  | { kind: "added"; title: string }
  | { kind: "removed"; title: string }
  | { kind: "timer"; watchMin: number; restMin: number };

export type CompanionDeps = {
  token: string;
  allowlist: {
    list(): AllowlistEntry[];
    upsert(entry: AllowlistEntry): void;
    remove(id: string): void;
  };
  presets: readonly PresetItem[];
  /**
   * Pasted playlists need the Data API to list their videos. Without a key
   * only catalog playlists (which carry seed videos) can play.
   */
  playlistsSupported: boolean;
  snapshot(): TimerSnapshot | null;
  /** Same contract as the TV settings screen: error text or null. */
  changePolicy(watchMin: number, restMin: number): string | null;
  lookup(parsed: ParsedYoutubeUrl): Promise<LinkLookup>;
  now(): number;
  onEntriesChanged(entries: AllowlistEntry[]): void;
  onActivity?(activity: CompanionActivity): void;
};

const MINUTE = 60_000;

const SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  // The token lives in the page URL; never leak it to thumbnail hosts.
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

const PAGE_CSP =
  "default-src 'none'; img-src https://i.ytimg.com; " +
  "style-src 'unsafe-inline'; script-src 'unsafe-inline'; " +
  "connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const EXPIRED_HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LittlePlay</title></head>
<body style="font-family:system-ui,sans-serif;background:#0A101C;color:#F5F2EA;padding:32px 20px">
<h1 style="font-size:22px">This link has expired</h1>
<p style="color:#94A3B8">Open <b>Parent settings → Add from phone</b> on the TV and scan the new QR code.</p>
</body></html>`;

function json(status: number, value: unknown): CompanionResponse {
  return {
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(value),
    headers: SECURITY_HEADERS,
  };
}

function fail(status: number, message: string): CompanionResponse {
  return json(status, { ok: false, message });
}

/** Minimal query parser; RN's URLSearchParams throws on bad escapes. */
export function parseQuery(query: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const pair of query.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const rawKey = eq < 0 ? pair : pair.slice(0, eq);
    const rawValue = eq < 0 ? "" : pair.slice(eq + 1);
    try {
      const key = decodeURIComponent(rawKey.replace(/\+/g, " "));
      if (!out.has(key)) {
        out.set(key, decodeURIComponent(rawValue.replace(/\+/g, " ")));
      }
    } catch {
      /* skip malformed pair */
    }
  }
  return out;
}

/**
 * Constant-time compare so response timing does not leak the token. Token
 * length is fixed and public, so an early length check leaks nothing.
 */
export function tokenMatches(expected: string, given: string | undefined): boolean {
  if (!given || expected.length === 0 || given.length !== expected.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  }
  return diff === 0;
}

function parseBody(body: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(body);
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function minutes(ms: number): number {
  return Math.round(ms / MINUTE);
}

export function companionState(deps: CompanionDeps) {
  const entries = deps.allowlist.list();
  const selectedIds = new Set(entries.map((e) => e.id));
  const presetIds = new Set(deps.presets.map((p) => p.id));
  const snap = deps.snapshot();
  return {
    ok: true as const,
    playlistsSupported: deps.playlistsSupported,
    timer: {
      watchMin: snap ? minutes(snap.policy.watchDurationMs) : null,
      restMin: snap ? minutes(snap.policy.restDurationMs) : null,
      watchRange: [minutes(WATCH_MIN_MS), minutes(WATCH_MAX_MS)],
      restRange: [minutes(REST_MIN_MS), minutes(REST_MAX_MS)],
      phase: snap?.phase ?? null,
      remainingMs: snap?.remainingMs ?? null,
    },
    shows: deps.presets.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      thumbnailUrl: p.thumbnailUrl,
      selected: selectedIds.has(p.id),
    })),
    links: entries
      .filter((e) => !presetIds.has(e.id))
      .map((e) => ({
        id: e.id,
        kind: e.kind,
        title: e.title,
        thumbnailUrl: e.thumbnailUrl,
      })),
  };
}

const LAST_ONE_MESSAGE =
  "Keep at least one show or link so there's something to watch.";

function commit(deps: CompanionDeps): CompanionResponse {
  deps.onEntriesChanged(deps.allowlist.list());
  return json(200, companionState(deps));
}

function placeholder(parsed: ParsedYoutubeUrl): {
  title: string;
  thumbnailUrl: string | null;
} {
  return parsed.kind === "Video"
    ? {
        title: "YouTube video",
        thumbnailUrl: `https://i.ytimg.com/vi/${parsed.id}/hqdefault.jpg`,
      }
    : { title: "YouTube playlist", thumbnailUrl: null };
}

async function addLink(
  deps: CompanionDeps,
  body: Record<string, unknown>,
): Promise<CompanionResponse> {
  const input = typeof body.input === "string" ? body.input : "";
  let parsed: ReturnType<typeof parseLinkInput>;
  try {
    parsed = parseLinkInput(input);
  } catch {
    return fail(400, "That doesn't look like a YouTube video or playlist link.");
  }
  if (!parsed.ok) return fail(400, parsed.message);
  const { id, kind } = parsed.value;
  if (kind === "Playlist" && !deps.playlistsSupported) {
    return fail(
      422,
      "Playlist links can't play on this TV yet. Paste a link to a single video instead.",
    );
  }

  const existing = deps.allowlist.list().find((e) => e.id === id);
  if (existing) {
    return json(200, {
      ...companionState(deps),
      notice: `"${existing.title}" is already on the list.`,
    });
  }

  const found = await deps.lookup(parsed.value);
  if (found.kind === "blocked") {
    return fail(422, linkErrorMessage(found.error));
  }
  const meta = found.kind === "ok" ? found : placeholder(parsed.value);
  const now = deps.now();
  const entry: AllowlistEntry = {
    id,
    kind,
    title: meta.title.slice(0, 200) || placeholder(parsed.value).title,
    thumbnailUrl: meta.thumbnailUrl,
    embeddable: null,
    source: "ManualUrl",
    addedAtWallMs: now,
    lastProbedWallMs: null,
  };
  deps.allowlist.upsert(entry);
  deps.onActivity?.({ kind: "added", title: entry.title });
  return commit(deps);
}

function removeEntry(
  deps: CompanionDeps,
  body: Record<string, unknown>,
): CompanionResponse {
  const id = typeof body.id === "string" ? body.id : "";
  const entries = deps.allowlist.list();
  const target = entries.find((e) => e.id === id);
  if (!target) return json(200, companionState(deps));
  if (entries.length <= 1) return fail(409, LAST_ONE_MESSAGE);
  deps.allowlist.remove(id);
  deps.onActivity?.({ kind: "removed", title: target.title });
  return commit(deps);
}

function toggleShow(
  deps: CompanionDeps,
  body: Record<string, unknown>,
): CompanionResponse {
  const id = typeof body.id === "string" ? body.id : "";
  const selected = body.selected === true;
  const preset = deps.presets.find((p) => p.id === id);
  if (!preset) return fail(404, "That show isn't in the catalog.");
  const entries = deps.allowlist.list();
  const has = entries.some((e) => e.id === id);

  if (selected && !has) {
    deps.allowlist.upsert({
      id: preset.id,
      kind: preset.kind as AllowlistKind,
      title: preset.title,
      thumbnailUrl: preset.thumbnailUrl,
      embeddable: preset.kind === "Video" ? true : null,
      source: "Catalog",
      addedAtWallMs: deps.now(),
      lastProbedWallMs: null,
    });
    deps.onActivity?.({ kind: "added", title: preset.title });
    return commit(deps);
  }
  if (!selected && has) {
    if (entries.length <= 1) return fail(409, LAST_ONE_MESSAGE);
    deps.allowlist.remove(id);
    deps.onActivity?.({ kind: "removed", title: preset.title });
    return commit(deps);
  }
  return json(200, companionState(deps));
}

function setTimer(
  deps: CompanionDeps,
  body: Record<string, unknown>,
): CompanionResponse {
  const watchMin = body.watchMin;
  const restMin = body.restMin;
  if (
    typeof watchMin !== "number" ||
    typeof restMin !== "number" ||
    !Number.isInteger(watchMin) ||
    !Number.isInteger(restMin)
  ) {
    return fail(400, "Minutes must be whole numbers.");
  }
  if (watchMin < minutes(WATCH_MIN_MS) || watchMin > minutes(WATCH_MAX_MS)) {
    return fail(
      400,
      `Watch time must be ${minutes(WATCH_MIN_MS)}–${minutes(WATCH_MAX_MS)} minutes.`,
    );
  }
  if (restMin < minutes(REST_MIN_MS) || restMin > minutes(REST_MAX_MS)) {
    return fail(
      400,
      `Break time must be ${minutes(REST_MIN_MS)}–${minutes(REST_MAX_MS)} minutes.`,
    );
  }
  const error = deps.changePolicy(watchMin, restMin);
  if (error) return fail(409, `The TV couldn't save that (${error}).`);
  deps.onActivity?.({ kind: "timer", watchMin, restMin });
  return json(200, companionState(deps));
}

/**
 * Routes one phone request. Every route, the page included, needs the
 * session token from the QR code (`?t=`). Never throws.
 */
export async function handleCompanionRequest(
  req: CompanionRequest,
  deps: CompanionDeps,
): Promise<CompanionResponse> {
  try {
    const query = parseQuery(req.query);
    const authed = tokenMatches(deps.token, query.get("t"));
    const method = req.method.toUpperCase();

    if (method === "GET" && req.path === "/") {
      if (!authed) {
        return {
          status: 403,
          contentType: "text/html; charset=utf-8",
          body: EXPIRED_HTML,
          headers: SECURITY_HEADERS,
        };
      }
      deps.onActivity?.({ kind: "connected" });
      return {
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: companionPageHtml(),
        headers: { ...SECURITY_HEADERS, "Content-Security-Policy": PAGE_CSP },
      };
    }

    if (!req.path.startsWith("/api/")) return fail(404, "Not found.");
    if (!authed) {
      return fail(403, "This link has expired. Scan the QR code on the TV again.");
    }

    if (method === "GET" && req.path === "/api/state") {
      return json(200, companionState(deps));
    }
    if (method !== "POST") return fail(405, "Method not allowed.");

    const body = parseBody(req.body);
    if (!body) return fail(400, "Bad request.");

    switch (req.path) {
      case "/api/links":
        return await addLink(deps, body);
      case "/api/remove":
        return removeEntry(deps, body);
      case "/api/shows":
        return toggleShow(deps, body);
      case "/api/timer":
        return setTimer(deps, body);
      default:
        return fail(404, "Not found.");
    }
  } catch {
    return fail(500, "Something went wrong on the TV. Try again.");
  }
}
