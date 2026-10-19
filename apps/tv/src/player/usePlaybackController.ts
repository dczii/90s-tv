import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cursorFromExpanded,
  type AllowlistEntry,
  type ExpandedVideoId,
  type TimerPhase,
} from "@littleplay/core";
import type { SqliteKv } from "../data/sqliteKv";
import { youtubeConfig, type AuthMode } from "../youtube/client";
import { messageForApiError } from "../youtube/errors";
import {
  channelsFromEntries,
  nextInChannel,
  resumeOnChannel,
  resumeWatching,
  type ChannelResume,
  type PlaybackChannel,
} from "./channels";
import { clearCursor, loadCursor, saveCursor } from "./cursorStore";
import { expandAndPickNext } from "./expandAllowlist";
import { loadSpots, saveSpots } from "./spotStore";
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
  channels: PlaybackChannel[];
  channelEntryId: string | null;
  /** Seconds to start the current video at. 0 plays from the beginning. */
  resumeSeconds: number;
};

/** How often the live playback spot is sampled while Playing. */
const SPOT_SAMPLE_MS = 1000;
/**
 * Right after a load the IFrame can still report the previous video's time.
 * commitPlay already records the start spot, so skipping this window is safe.
 */
const SPOT_SETTLE_MS = 2500;
/** Samples between SQLite writes; leaving Playing always writes. */
const SPOT_PERSIST_EVERY = 5;

type LiveSpot = { entryId: string; videoId: string; since: number };

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
  tuneChannel: (entryId: string) => Promise<void>;
  /** Live dial id, including a tune that has not re-rendered yet. */
  currentChannelId: () => string | null;
  /** Remember the live playback position so a later remount seeks back. */
  holdPosition: (seconds: number) => void;
} {
  const { phase, kv, entries, player, confirmWatching } = opts;
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState<string | null>(null);
  const [noPlayableSlate, setNoPlayableSlate] = useState(false);
  const [continueBusy, setContinueBusy] = useState(false);
  const [noPlayableOnConfirm, setNoPlayableOnConfirm] = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [channelEntryId, setChannelEntryId] = useState<string | null>(null);
  const infoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPhase = useRef<TimerPhase | undefined>(undefined);
  const restoredRef = useRef(false);
  const opRef = useRef(0);
  const [resumeSeconds, setResumeSeconds] = useState(0);
  const channelRef = useRef<string | null>(null);
  const videoIdRef = useRef<string | null>(null);
  const spotsRef = useRef(new Map<string, ChannelResume>());
  /** The video the player was last told to load, for sampling its spot. */
  const liveRef = useRef<LiveSpot | null>(null);
  const tuneChain = useRef(Promise.resolve());
  const channels = useMemo(() => channelsFromEntries(entries), [entries]);

  // Spots outlive the process, so a break across a restart still resumes.
  useEffect(() => {
    if (kv) spotsRef.current = loadSpots(kv);
  }, [kv]);

  const flashInfo = useCallback(() => {
    setShowInfo(true);
    if (infoTimer.current) clearTimeout(infoTimer.current);
    infoTimer.current = setTimeout(() => setShowInfo(false), 3000);
  }, []);

  const commitPlay = useCallback(
    async (next: ExpandedVideoId, op: number, startSeconds = 0) => {
      if (!kv || op !== opRef.current) return;
      const title = entries.find((entry) => entry.id === next.entryId)?.title ?? null;
      const start =
        Number.isFinite(startSeconds) && startSeconds > 0 ? startSeconds : 0;
      channelRef.current = next.entryId;
      videoIdRef.current = next.videoId;
      spotsRef.current.set(next.entryId, {
        videoId: next.videoId,
        seconds: start,
      });
      liveRef.current = {
        entryId: next.entryId,
        videoId: next.videoId,
        since: Date.now(),
      };
      setChannelEntryId(next.entryId);
      setNoPlayableSlate(false);
      saveCursor(kv, cursorFromExpanded(next));
      saveSpots(kv, spotsRef.current);
      setVideoId(next.videoId);
      setResumeSeconds(start);
      setVideoTitle(title);
      player.requestAttach();
      if (op !== opRef.current) return;
      await player.loadVideo(next.videoId, start);
    },
    [entries, kv, player],
  );

  const showChannelSlate = useCallback(
    async (op: number) => {
      if (op !== opRef.current) return;
      await player.detachAndDestroy();
      if (op !== opRef.current) return;
      setNoPlayableSlate(true);
      setVideoId(null);
      setResumeSeconds(0);
      videoIdRef.current = null;
      liveRef.current = null;
    },
    [player],
  );

  const skipToNext = useCallback(async () => {
    if (!kv) return;
    const op = ++opRef.current;
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
    if (op !== opRef.current) return;
    const entryId = channelRef.current ?? cursor?.entryId ?? null;
    const next =
      result.status === "ok" && entryId
        ? nextInChannel(
            result.expanded,
            entryId,
            cursor,
            result.definitiveSkipIds,
            true,
          )
        : null;
    if (!next) {
      await showChannelSlate(op);
      return;
    }
    await commitPlay(next, op);
  }, [commitPlay, entries, kv, showChannelSlate]);

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
      liveRef.current = null;
      void player.detachAndDestroy();
      setVideoId(null);
      setResumeSeconds(0);
      videoIdRef.current = null;
      setNoPlayableSlate(false);
    }
  }, [phase, player]);

  // The player is gone by the time a break starts, so keep the spot current
  // while Playing; Continue then picks up within a second of where it stopped.
  useEffect(() => {
    if (phase !== "Playing" || !kv) return;
    let samples = 0;
    let busy = false;
    const timer = setInterval(() => {
      const live = liveRef.current;
      if (busy || !live || Date.now() - live.since < SPOT_SETTLE_MS) return;
      busy = true;
      void player.currentTime().then((seconds) => {
        busy = false;
        if (liveRef.current !== live || !(seconds >= 1)) return;
        spotsRef.current.set(live.entryId, {
          videoId: live.videoId,
          seconds,
        });
        samples += 1;
        if (samples % SPOT_PERSIST_EVERY === 0) {
          saveSpots(kv, spotsRef.current);
        }
      });
    }, SPOT_SAMPLE_MS);
    return () => {
      clearInterval(timer);
      saveSpots(kv, spotsRef.current);
    };
  }, [phase, kv, player]);

  // Restore into still-valid Playing after tick (YT-D23) — once.
  useEffect(() => {
    if (restoredRef.current) return;
    if (phase !== "Playing" || !kv) return;
    restoredRef.current = true;
    const op = ++opRef.current;
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
      if (op !== opRef.current) return;
      const target =
        result.status === "ok"
          ? resumeWatching(
              result.expanded,
              cursor,
              spotsRef.current,
              result.definitiveSkipIds,
            )
          : null;
      if (!target) {
        setNoPlayableSlate(true);
        return;
      }
      await commitPlay(target.item, op, target.seconds);
    })();
  }, [phase, kv, entries, commitPlay]);

  const holdPosition = useCallback((seconds: number) => {
    if (!(seconds >= 1)) return;
    const live = liveRef.current;
    if (live) {
      spotsRef.current.set(live.entryId, { videoId: live.videoId, seconds });
    }
    setResumeSeconds(seconds);
  }, []);

  const currentChannelId = useCallback(() => channelRef.current, []);

  const tuneChannel = useCallback(
    (entryId: string) => {
      const job = tuneChain.current.catch(() => undefined).then(async () => {
        if (!kv || entryId === channelRef.current) return;
        const leavingId = channelRef.current;
        const leavingVideo = videoIdRef.current;
        const seconds =
          leavingId && leavingVideo ? await player.currentTime() : 0;
        if (entryId === channelRef.current) return;
        if (leavingId && leavingVideo && seconds >= 1) {
          spotsRef.current.set(leavingId, { videoId: leavingVideo, seconds });
        }
        const op = ++opRef.current;
        channelRef.current = entryId;
        setChannelEntryId(entryId);
        const cfg = youtubeConfig();
        const result = await expandAndPickNext(
          entries,
          { entryId, index: 0 },
          catalogAuth(),
          cfg.apiKey,
          {},
          false,
        );
        if (op !== opRef.current) return;
        const target =
          result.status === "ok"
            ? resumeOnChannel(
                result.expanded,
                entryId,
                spotsRef.current.get(entryId) ?? null,
                result.definitiveSkipIds,
                loadCursor(kv),
              )
            : null;
        if (!target) {
          await showChannelSlate(op);
          return;
        }
        await commitPlay(target.item, op, target.seconds);
      });
      tuneChain.current = job.then(
        () => undefined,
        () => undefined,
      );
      return job;
    },
    [commitPlay, entries, kv, player, showChannelSlate],
  );

  const continueWatching = useCallback(async () => {
    if (!kv) return;
    setContinueBusy(true);
    setContinueError(null);
    setNoPlayableOnConfirm(false);
    const op = ++opRef.current;
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
      if (op !== opRef.current) return;
      if (result.status === "error") {
        setContinueError(messageForApiError(result.error));
        return;
      }
      const target = resumeWatching(
        result.expanded,
        cursor,
        spotsRef.current,
        result.definitiveSkipIds,
      );
      if (!target) {
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
      await commitPlay(target.item, op, target.seconds);
    } finally {
      setContinueBusy(false);
    }
  }, [kv, entries, confirmWatching, commitPlay]);

  return {
    ui: {
      videoId,
      videoTitle,
      noPlayableSlate,
      continueBusy,
      noPlayableOnConfirm,
      continueError,
      showInfo,
      channels,
      channelEntryId,
      resumeSeconds,
    },
    continueWatching,
    flashInfo,
    tuneChannel,
    currentChannelId,
    holdPosition,
  };
}

export function resetCursorOnEmptyAllowlist(
  kv: SqliteKv,
  entries: AllowlistEntry[],
): void {
  if (entries.length === 0) clearCursor(kv);
}
