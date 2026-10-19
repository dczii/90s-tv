import {
  parseYoutubeUrl,
  type AllowlistEntry,
  type AllowlistKind,
  type TimerPhase,
} from "@littleplay/core";
import type { AllowlistRepository } from "../data/allowlistRepo";

export type LinkView = {
  id: string;
  kind: AllowlistKind;
  title: string;
  url: string;
};

export type LinkRequest = {
  method: string;
  route: string;
  body: string;
  entryId: string;
};

export type OEmbedHit = {
  title: string;
  thumbnailUrl: string | null;
};

export type LinkHandlerDeps = {
  now: number;
  lookup?: (canonicalUrl: string) => Promise<OEmbedHit | null>;
};

export type PhoneSnapshot = {
  phase: TimerPhase;
  watchMin: number;
  restMin: number;
  remainingMs: number;
  currentId: string | null;
};

export type PhoneActions = {
  snapshot: () => PhoneSnapshot;
  tune: (entryId: string) => Promise<void>;
  saveCursor: (entryId: string) => void;
  changePolicy: (watchMin: number, restMin: number) => string | null;
};

/**
 * The channel the phone should show. While a show is on, the live dial wins.
 * Otherwise the saved cursor is what Continue will start, with the live id
 * only as a fallback.
 */
export function phoneChannelId(
  phase: TimerPhase,
  liveId: string | null,
  cursorId: string | null,
): string | null {
  if (phase === "Playing") return liveId;
  return cursorId ?? liveId;
}

export type LinkHandlerResult = {
  status: number;
  body: string;
  changed: boolean;
};

const BAD_URL = "That doesn't look like a YouTube link.";
const UNSUPPORTED = "Only YouTube video and playlist links can be added.";
const DUPLICATE = "That link is already in the list.";
const MISSING = "That link is not in the list.";

export function canonicalYoutubeUrl(kind: AllowlistKind, id: string): string {
  if (kind === "Playlist") {
    return `https://www.youtube.com/playlist?list=${encodeURIComponent(id)}`;
  }
  return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
}

function json(status: number, payload: unknown, changed = false): LinkHandlerResult {
  return { status, body: JSON.stringify(payload), changed };
}

function toView(entry: AllowlistEntry): LinkView {
  return {
    id: entry.id,
    kind: entry.kind,
    title: entry.title,
    url: canonicalYoutubeUrl(entry.kind, entry.id),
  };
}

export async function handleLinkRequest(
  repo: AllowlistRepository,
  request: LinkRequest,
  deps: LinkHandlerDeps,
): Promise<LinkHandlerResult> {
  if (request.route === "list" && request.method === "GET") {
    return json(200, { links: repo.list().map(toView) });
  }

  if (request.route === "remove" && request.method === "DELETE") {
    const id = request.entryId.trim();
    if (!id || !repo.list().some((entry) => entry.id === id)) {
      return json(404, { error: MISSING });
    }
    repo.remove(id);
    return json(200, { ok: true }, true);
  }

  if (request.route === "add" && request.method === "POST") {
    return addLink(repo, request.body, deps);
  }

  return json(404, { error: "Not found" });
}

export async function handlePhoneRequest(
  repo: AllowlistRepository,
  request: LinkRequest,
  deps: LinkHandlerDeps,
  actions?: PhoneActions,
): Promise<LinkHandlerResult> {
  if (
    request.route === "remote" ||
    request.route === "now" ||
    request.route === "timer"
  ) {
    if (!actions) return json(503, { error: "Not ready" });
    return handleRemote(repo, request, actions);
  }
  return handleLinkRequest(repo, request, deps);
}

async function handleRemote(
  repo: AllowlistRepository,
  request: LinkRequest,
  actions: PhoneActions,
): Promise<LinkHandlerResult> {
  if (request.route === "remote" && request.method === "GET") {
    const snapshot = actions.snapshot();
    return json(200, {
      links: repo.list().map(toView),
      currentId: snapshot.currentId,
      phase: snapshot.phase,
      watchMin: snapshot.watchMin,
      restMin: snapshot.restMin,
      remainingMs: snapshot.remainingMs,
    });
  }

  if (request.route === "now" && request.method === "GET") {
    return json(200, { id: actions.snapshot().currentId });
  }

  if (request.route === "now" && request.method === "PUT") {
    return setCurrentChannel(repo, request.body, actions);
  }

  if (request.route === "timer" && request.method === "PUT") {
    return setTimer(request.body, actions);
  }

  return json(405, { error: "Method not allowed" });
}

async function setCurrentChannel(
  repo: AllowlistRepository,
  rawBody: string,
  actions: PhoneActions,
): Promise<LinkHandlerResult> {
  const id = readId(rawBody);
  if (!id || !repo.list().some((entry) => entry.id === id)) {
    return json(404, { error: MISSING });
  }
  if (actions.snapshot().phase === "Playing") {
    await actions.tune(id);
  } else {
    actions.saveCursor(id);
  }
  return json(200, { id });
}

function setTimer(rawBody: string, actions: PhoneActions): LinkHandlerResult {
  const minutes = readMinutes(rawBody);
  if ("error" in minutes) return json(400, { error: minutes.error });
  const error = actions.changePolicy(minutes.watchMin, minutes.restMin);
  if (error) return json(400, { error });
  return json(200, { watchMin: minutes.watchMin, restMin: minutes.restMin });
}

function readId(rawBody: string): string {
  try {
    const parsed = JSON.parse(rawBody) as { id?: unknown };
    return typeof parsed.id === "string" ? parsed.id.trim() : "";
  } catch {
    return "";
  }
}

function readMinutes(
  rawBody: string,
): { watchMin: number; restMin: number } | { error: string } {
  let watchMin: unknown;
  let restMin: unknown;
  try {
    const parsed = JSON.parse(rawBody) as {
      watchMin?: unknown;
      restMin?: unknown;
    };
    watchMin = parsed.watchMin;
    restMin = parsed.restMin;
  } catch {
    return { error: "Invalid watchDurationMs" };
  }
  if (!isFiniteNumber(watchMin)) return { error: "Invalid watchDurationMs" };
  if (!isFiniteNumber(restMin)) return { error: "Invalid restDurationMs" };
  return { watchMin, restMin };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

async function addLink(
  repo: AllowlistRepository,
  rawBody: string,
  deps: LinkHandlerDeps,
): Promise<LinkHandlerResult> {
  let url = "";
  try {
    const parsedBody = JSON.parse(rawBody) as { url?: unknown };
    url = typeof parsedBody.url === "string" ? parsedBody.url : "";
  } catch {
    return json(400, { error: BAD_URL });
  }

  const parsed = parseYoutubeUrl(url);
  if (!parsed.ok) {
    return json(400, {
      error: parsed.error.kind === "UnsupportedHost" ? UNSUPPORTED : BAD_URL,
    });
  }

  if (repo.list().some((entry) => entry.id === parsed.value.id)) {
    return json(409, { error: DUPLICATE });
  }

  const canonical = canonicalYoutubeUrl(parsed.value.kind, parsed.value.id);
  let meta: OEmbedHit | null = null;
  if (deps.lookup) {
    try {
      meta = await deps.lookup(canonical);
    } catch {
      meta = null;
    }
  }
  const title = meta?.title.trim() || parsed.value.id;
  const entry: AllowlistEntry = {
    id: parsed.value.id,
    kind: parsed.value.kind,
    title,
    thumbnailUrl: meta?.thumbnailUrl ?? null,
    embeddable: null,
    source: "ManualUrl",
    addedAtWallMs: deps.now,
    lastProbedWallMs: null,
  };
  repo.upsert(entry);
  return json(201, { link: toView(entry) }, true);
}
