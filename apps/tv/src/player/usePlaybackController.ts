import { useCallback, useEffect, useRef, useState } from "react";
import {
  cursorFromExpanded,
  type AllowlistEntry,
  type TimerPhase,
} from "@littleplay/core";
import type { SqliteKv } from "../data/sqliteKv";
import { youtubeConfig, type AuthMode } from "../youtube/client";
import { messageForApiError } from "../youtube/errors";
import { clearCursor, loadCursor, saveCursor } from "./cursorStore";
import { expandAndPickNext } from "./expandAllowlist";
import {
  SKIP_IFRAME_ERROR_CODES,
  type PlayerSessionApi,
  type PlayerSessionEvent,
} from "./PlayerSession";

export type PlaybackUi = {
  videoId: string | null;
  videoTitle: string | null;
  noPlayableSlate: boolean;
  continueBusy: boolean;
  noPlayableOnConfirm: boolean;
  continueError: string | null;
  showInfo: boolean;
};

/** Catalog-only: expand/probe public playlists with the Data API key. */
function catalogAuth(): AuthMode {
  return { type: "apiKey" };
}

/**
 * Owns Continue → expand/probe → confirm → attach, skip/end, and destroy on
 * phase leave. TimerEngine remains phase authority.
 */
export function usePlaybackController(opts: {
  phase: TimerPhase | undefined;
  kv: SqliteKv | null;
  entries: AllowlistEntry[];
  player: PlayerSessionApi;
  confirmWatching: () => string | null;
}): {
  ui: PlaybackUi;
  continueWatching: () => Promise<void>;
  flashInfo: () => void;
} {
  const { phase, kv, entries, player, confirmWatching } = opts;
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState<string | null>(null);
  const [noPlayableSlate, setNoPlayableSlate] = useState(false);
  const [continueBusy, setContinueBusy] = useState(false);
  const [noPlayableOnConfirm, setNoPlayableOnConfirm] = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const infoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPhase = useRef<TimerPhase | undefined>(undefined);
  const restoredRef = useRef(false);

  const flashInfo = useCallback(() => {
    setShowInfo(true);
    if (infoTimer.current) clearTimeout(infoTimer.current);
    infoTimer.current = setTimeout(() => setShowInfo(false), 3000);
  }, []);

  const playCandidate = useCallback(
    async (id: string, title: string | null) => {
      setNoPlayableSlate(false);
      setVideoId(id);
      setVideoTitle(title);
      player.requestAttach();
      // loadVideo runs from PlayingShell after mount
    },
    [player],
  );

  const skipToNext = useCallback(async () => {
    if (!kv) return;
    const cfg = youtubeConfig();
    const auth = catalogAuth();
    const cursor = loadCursor(kv);
    const result = await expandAndPickNext(
      entries,
      cursor,
      auth,
      cfg.apiKey,
      {},
      true,
    );
    if (result.status !== "ok" || !result.next) {
      await player.detachAndDestroy();
      setNoPlayableSlate(true);
      setVideoId(null);
      return;
    }
    saveCursor(kv, cursorFromExpanded(result.next));
    setVideoId(result.next.videoId);
    setVideoTitle(null);
    player.requestAttach();
    await player.loadVideo(result.next.videoId);
  }, [entries, kv, player]);

  useEffect(() => {
    player.setEventHandler((event: PlayerSessionEvent) => {
      if (event.kind === "ended") {
        void skipToNext();
        return;
      }
      if (
        event.kind === "error" &&
        SKIP_IFRAME_ERROR_CODES.has(event.code)
      ) {
        void skipToNext();
      }
    });
    return () => player.setEventHandler(null);
  }, [player, skipToNext]);

  // Destroy player when leaving Playing (YT-D22).
  useEffect(() => {
    const prev = prevPhase.current;
    prevPhase.current = phase;
    if (prev === "Playing" && phase !== "Playing") {
      void player.detachAndDestroy();
      setVideoId(null);
      setNoPlayableSlate(false);
    }
  }, [phase, player]);

  // Restore into still-valid Playing after tick (YT-D23) — once.
  useEffect(() => {
    if (restoredRef.current) return;
    if (phase !== "Playing" || !kv) return;
    restoredRef.current = true;
    void (async () => {
      const cfg = youtubeConfig();
      const auth = catalogAuth();
      const cursor = loadCursor(kv);
      const result = await expandAndPickNext(
        entries,
        cursor,
        auth,
        cfg.apiKey,
        {},
        false,
      );
      if (result.status !== "ok" || !result.next) {
        setNoPlayableSlate(true);
        return;
      }
      saveCursor(kv, cursorFromExpanded(result.next));
      await playCandidate(result.next.videoId, null);
    })();
  }, [phase, kv, entries, playCandidate]);

  const continueWatching = useCallback(async () => {
    if (!kv) return;
    setContinueBusy(true);
    setContinueError(null);
    setNoPlayableOnConfirm(false);
    try {
      if (entries.length === 0) {
        setContinueError("Add allowed videos before continuing.");
        return;
      }
      const cfg = youtubeConfig();
      if (!cfg.apiKey) {
        setContinueError("YouTube API key is not configured on this device.");
        return;
      }
      const auth = catalogAuth();
      const cursor = loadCursor(kv);
      const result = await expandAndPickNext(
        entries,
        cursor,
        auth,
        cfg.apiKey,
        {},
        false,
      );
      if (result.status === "error") {
        setContinueError(messageForApiError(result.error));
        return;
      }
      if (!result.next) {
        setNoPlayableOnConfirm(true);
        setContinueError("No playable videos in the allowlist.");
        return;
      }
      const rejected = confirmWatching();
      if (rejected) {
        setContinueError(rejected);
        return;
      }
      // Prevent the boot-restore effect from double-attaching.
      restoredRef.current = true;
      saveCursor(kv, cursorFromExpanded(result.next));
      await playCandidate(result.next.videoId, null);
    } finally {
      setContinueBusy(false);
    }
  }, [kv, entries, confirmWatching, playCandidate]);

  return {
    ui: {
      videoId,
      videoTitle,
      noPlayableSlate,
      continueBusy,
      noPlayableOnConfirm,
      continueError,
      showInfo,
    },
    continueWatching,
    flashInfo,
  };
}

export function resetCursorOnEmptyAllowlist(
  kv: SqliteKv,
  entries: AllowlistEntry[],
): void {
  if (entries.length === 0) clearCursor(kv);
}
