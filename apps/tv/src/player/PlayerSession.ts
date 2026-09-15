import { useCallback, useRef, useState, type RefObject } from "react";
import type { NativeSyntheticEvent } from "react-native";
import type {
  PlayerEventPayload,
  YoutubePlayerViewRef,
} from "youtube-player";

/** IFrame errors that skip to the next video id (YT-04). Not 105. */
export const SKIP_IFRAME_ERROR_CODES = new Set([2, 5, 100, 101, 150]);

export type PlayerSessionEvent =
  | { kind: "ready"; generation: number }
  | { kind: "stateChange"; generation: number; state: string }
  | { kind: "ended"; generation: number }
  | { kind: "error"; generation: number; code: number }
  | { kind: "stale"; generation: number };

export type PlayerSessionApi = {
  /** Mount YoutubePlayerView only when this is true and phase === Playing. */
  attached: boolean;
  /** Last known native generation echoed in events (for tests). */
  lastSeenGeneration: number | null;
  nativeRef: RefObject<YoutubePlayerViewRef | null>;
  /** Product destroy path: bump + destroy, then clear attached so view unmounts. */
  detachAndDestroy: () => Promise<void>;
  /** Mark attached so the view mounts; call loadVideo after mount/attach. */
  requestAttach: () => void;
  loadVideo: (videoId: string) => Promise<void>;
  onNativeEvent: (event: NativeSyntheticEvent<PlayerEventPayload>) => void;
  onHostPause: () => Promise<void>;
  onHostResume: () => Promise<void>;
  setEventHandler: (handler: ((e: PlayerSessionEvent) => void) | null) => void;
};

/**
 * JS PlayerSession wrapping the native YoutubePlayerView (RN-D21/D22).
 * Native owns generation increments; JS drops mismatched events.
 */
export function usePlayerSession(): PlayerSessionApi {
  const nativeRef = useRef<YoutubePlayerViewRef | null>(null);
  const [attached, setAttached] = useState(false);
  const [lastSeenGeneration, setLastSeenGeneration] = useState<number | null>(
    null,
  );
  const handlerRef = useRef<((e: PlayerSessionEvent) => void) | null>(null);
  const expectedGenerationRef = useRef<number | null>(null);

  const setEventHandler = useCallback(
    (handler: ((e: PlayerSessionEvent) => void) | null) => {
      handlerRef.current = handler;
    },
    [],
  );

  const requestAttach = useCallback(() => {
    setAttached(true);
  }, []);

  const detachAndDestroy = useCallback(async () => {
    expectedGenerationRef.current = null;
    try {
      await nativeRef.current?.detachAndDestroy();
    } catch {
      // Idempotent: missing ref or double-destroy is fine.
    }
    setAttached(false);
  }, []);

  const loadVideo = useCallback(async (videoId: string) => {
    const ref = nativeRef.current;
    if (!ref) return;
    await ref.attach();
    const gen = await ref.currentGeneration().catch(() => null);
    if (gen != null) expectedGenerationRef.current = gen;
    await ref.loadVideo(videoId);
  }, []);

  const onNativeEvent = useCallback(
    (event: NativeSyntheticEvent<PlayerEventPayload>) => {
      const payload = event.nativeEvent;
      const gen = payload.generation;
      setLastSeenGeneration(gen);
      const expected = expectedGenerationRef.current;
      if (expected != null && gen !== expected) {
        handlerRef.current?.({ kind: "stale", generation: gen });
        return;
      }
      if (expected == null) expectedGenerationRef.current = gen;

      const type = payload.type;
      if (type === "ready") {
        handlerRef.current?.({ kind: "ready", generation: gen });
        return;
      }
      if (type === "stateChange") {
        handlerRef.current?.({
          kind: "stateChange",
          generation: gen,
          state: payload.state ?? "",
        });
        return;
      }
      if (type === "ended") {
        handlerRef.current?.({ kind: "ended", generation: gen });
        return;
      }
      if (type === "error") {
        handlerRef.current?.({
          kind: "error",
          generation: gen,
          code: payload.code ?? -1,
        });
      }
    },
    [],
  );

  const onHostPause = useCallback(async () => {
    try {
      await nativeRef.current?.onHostPause();
    } catch {
      /* ok */
    }
  }, []);

  const onHostResume = useCallback(async () => {
    try {
      await nativeRef.current?.onHostResume();
    } catch {
      /* ok */
    }
  }, []);

  return {
    attached,
    lastSeenGeneration,
    nativeRef,
    detachAndDestroy,
    requestAttach,
    loadVideo,
    onNativeEvent,
    onHostPause,
    onHostResume,
    setEventHandler,
  };
}
