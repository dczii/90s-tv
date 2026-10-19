import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  addPhoneLinkRequestListener,
  respondPhoneLink,
  stopPhoneLinkServer,
} from "phone-link";
import {
  TimerEngine,
  type AllowlistEntry,
  type TimerEvent,
  type TimerSnapshot,
} from "@littleplay/core";
import { openLittlePlayDb, type AppDatabase } from "../data/openDb";
import { loadStore, saveTimer } from "../data/timerStore";
import type { AllowlistRepository } from "../data/allowlistRepo";
import type { SqliteKv } from "../data/sqliteKv";
import { addActivityResumeListener, deviceTime } from "../time/deviceTime";
import { handlePhoneRequest, phoneChannelId } from "../phone/linkHandler";
import { lookupOEmbed } from "../phone/oEmbed";
import { startPhoneLink } from "../phone/phoneLink";
import { loadCursor, saveCursor as saveAllowlistCursor } from "../player/cursorStore";

export type WizardStep =
  | "welcome"
  | "timerSetup"
  | "curated"
  | "choose"
  | null;

export type AppSession = {
  engine: TimerEngine;
  kv: SqliteKv;
  allowlist: AllowlistRepository;
  firstTickDone: boolean;
};

function shouldPersistTick(event: TimerEvent, firstTickDone: boolean): boolean {
  if (event.kind === "PhaseChanged") return true;
  return !firstTickDone;
}

export function createSession(): AppSession {
  const db: AppDatabase = openLittlePlayDb();
  const loaded = loadStore(db.kv);
  const engine = new TimerEngine(loaded.timer);
  return {
    engine,
    kv: db.kv,
    allowlist: db.allowlist,
    firstTickDone: false,
  };
}

export type ContentRoute = "choose" | null;

export type SessionApi = {
  snapshot: TimerSnapshot | null;
  bootError: string | null;
  wizardStep: WizardStep;
  showSettings: boolean;
  contentRoute: ContentRoute;
  allowlistEntries: AllowlistEntry[];
  allowlistRepo: AllowlistRepository | null;
  kv: SqliteKv | null;
  tickNow: () => void;
  completeSetup: (watchMin: number, restMin: number) => string | null;
  confirmWatching: () => string | null;
  changePolicy: (watchMin: number, restMin: number) => string | null;
  resetCycle: () => string | null;
  openSettings: () => void;
  closeSettings: () => void;
  startSetup: () => void;
  openChoose: () => void;
  closeContent: () => void;
  goWizardCurated: () => void;
  goWizardChoose: () => void;
  finishWizard: () => void;
  onAllowlistSaved: (entries: AllowlistEntry[]) => void;
  onPlaylistsUpdated: (entries: AllowlistEntry[]) => void;
  phoneUrl: string | null;
  phoneLinkOffline: boolean;
  bindPhonePlayback: (playback: PhonePlayback) => void;
};

export type PhonePlayback = {
  currentId: () => string | null;
  tune: (entryId: string) => Promise<void>;
};

export function useAppSession(): SessionApi {
  const sessionRef = useRef<AppSession | null>(null);
  const [snapshot, setSnapshot] = useState<TimerSnapshot | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState<WizardStep>("welcome");
  const [showSettings, setShowSettings] = useState(false);
  const [contentRoute, setContentRoute] = useState<ContentRoute>(null);
  const [allowlistEntries, setAllowlistEntries] = useState<AllowlistEntry[]>(
    [],
  );
  const [allowlistRepo, setAllowlistRepo] =
    useState<AllowlistRepository | null>(null);
  const [phoneUrl, setPhoneUrl] = useState<string | null>(null);
  const [phoneLinkOffline, setPhoneLinkOffline] = useState(false);
  const phoneLinkWanted = useRef(false);
  const phonePlaybackRef = useRef<PhonePlayback | null>(null);
  const changePolicyRef = useRef<(watchMin: number, restMin: number) => string | null>(
    () => "Not ready",
  );

  const persistAll = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    saveTimer(session.kv, session.engine.persisted());
  }, []);

  const applyEvent = useCallback(
    (event: TimerEvent, persist: boolean) => {
      const session = sessionRef.current;
      if (!session) return;
      setSnapshot(event.snapshot);
      if (persist) persistAll();
    },
    [persistAll],
  );

  const publishPhoneLink = useCallback(() => {
    const session = sessionRef.current;
    if (!session || !phoneLinkWanted.current) return;
    if (AppState.currentState !== "active") {
      stopPhoneLinkServer();
      return;
    }
    try {
      const url = startPhoneLink(session.kv);
      setPhoneUrl(url);
      setPhoneLinkOffline(url == null);
    } catch {
      setPhoneUrl(null);
      setPhoneLinkOffline(true);
    }
  }, []);

  const tickNow = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    const now = deviceTime();
    const event = session.engine.tick(now);
    const persist = shouldPersistTick(event, session.firstTickDone);
    session.firstTickDone = true;
    applyEvent(event, persist);
  }, [applyEvent]);

  useEffect(() => {
    try {
      const session = createSession();
      sessionRef.current = session;
      const now = deviceTime();
      const event = session.engine.tick(now);
      session.firstTickDone = true;
      setSnapshot(event.snapshot);
      setAllowlistEntries(session.allowlist.list());
      setAllowlistRepo(session.allowlist);
      persistAll();
      if (event.snapshot.phase !== "Setup") {
        setWizardStep(null);
      }
    } catch (err) {
      setBootError(err instanceof Error ? err.message : String(err));
    }
  }, [persistAll]);

  useEffect(() => {
    const sub = addPhoneLinkRequestListener((event) => {
      void (async () => {
        const session = sessionRef.current;
        try {
          if (!session) {
            respondPhoneLink(
              event.id,
              503,
              JSON.stringify({ error: "Not ready" }),
            );
            return;
          }
          const result = await handlePhoneRequest(
            session.allowlist,
            {
              method: event.method,
              route: event.route,
              body: event.body,
              entryId: event.entryId,
            },
            { now: Date.now(), lookup: lookupOEmbed },
            {
              snapshot: () => {
                const snap = session.engine.snapshot(deviceTime());
                const cursorId = loadCursor(session.kv)?.entryId ?? null;
                const liveId = phonePlaybackRef.current?.currentId() ?? null;
                return {
                  phase: snap.phase,
                  watchMin: Math.round(snap.policy.watchDurationMs / 60_000),
                  restMin: Math.round(snap.policy.restDurationMs / 60_000),
                  remainingMs: snap.remainingMs,
                  currentId: phoneChannelId(snap.phase, liveId, cursorId),
                };
              },
              tune: async (entryId) => {
                const playback = phonePlaybackRef.current;
                if (!playback) throw new Error("Not ready");
                await playback.tune(entryId);
              },
              saveCursor: (entryId) => {
                saveAllowlistCursor(session.kv, { entryId, index: 0 });
              },
              changePolicy: (watchMin, restMin) =>
                changePolicyRef.current(watchMin, restMin),
            },
          );
          respondPhoneLink(event.id, result.status, result.body);
          if (result.changed) {
            setAllowlistEntries(session.allowlist.list());
          }
        } catch (err) {
          const notReady = err instanceof Error && err.message === "Not ready";
          respondPhoneLink(
            event.id,
            notReady ? 503 : 500,
            JSON.stringify({
              error: notReady ? "Not ready" : "Could not update the list.",
            }),
          );
        }
      })();
    });
    return () => {
      sub.remove();
      stopPhoneLinkServer();
    };
  }, []);

  useEffect(() => {
    if (!showSettings) return;
    phoneLinkWanted.current = true;
    publishPhoneLink();
  }, [showSettings, allowlistRepo, publishPhoneLink]);

  useEffect(() => {
    const onResume = () => tickNow();
    const sub = addActivityResumeListener(onResume);
    const appSub = AppState.addEventListener(
      "change",
      (next: AppStateStatus) => {
        if (next === "active") {
          onResume();
          publishPhoneLink();
        } else if (next === "background") {
          stopPhoneLinkServer();
        }
      },
    );
    const interval = setInterval(() => {
      if (AppState.currentState === "active") tickNow();
    }, 1000);
    return () => {
      sub.remove();
      appSub.remove();
      clearInterval(interval);
    };
  }, [tickNow, publishPhoneLink]);

  const completeSetup = useCallback(
    (watchMin: number, restMin: number) => {
      const session = sessionRef.current;
      if (!session) return "Not ready";
      const now = deviceTime();
      const result = session.engine.completeSetup(
        {
          watchDurationMs: watchMin * 60_000,
          restDurationMs: restMin * 60_000,
        },
        now,
      );
      if (result.kind === "Rejected") {
        return result.error.kind === "PolicyOutOfRange"
          ? `Invalid ${result.error.field}`
          : result.error.kind;
      }
      applyEvent(result.event, true);
      setWizardStep("curated");
      return null;
    },
    [applyEvent],
  );

  const confirmWatching = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return "Not ready";
    if (session.allowlist.list().length === 0) {
      return "AllowlistEmpty";
    }
    const result = session.engine.confirmWatching(deviceTime());
    if (result.kind === "Rejected") {
      return result.error.kind;
    }
    applyEvent(result.event, true);
    return null;
  }, [applyEvent]);

  const changePolicy = useCallback(
    (watchMin: number, restMin: number) => {
      const session = sessionRef.current;
      if (!session) return "Not ready";
      const result = session.engine.changePolicy(
        {
          watchDurationMs: watchMin * 60_000,
          restDurationMs: restMin * 60_000,
        },
        deviceTime(),
      );
      if (result.kind === "Rejected") {
        return result.error.kind === "PolicyOutOfRange"
          ? `Invalid ${result.error.field}`
          : result.error.kind;
      }
      applyEvent(result.event, true);
      return null;
    },
    [applyEvent],
  );
  changePolicyRef.current = changePolicy;

  const bindPhonePlayback = useCallback((playback: PhonePlayback) => {
    phonePlaybackRef.current = playback;
  }, []);

  const resetCycle = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return "Not ready";
    const result = session.engine.resetCycle(deviceTime());
    if (result.kind === "Rejected") return result.error.kind;
    applyEvent(result.event, true);
    return null;
  }, [applyEvent]);

  const effectiveWizard: WizardStep =
    snapshot?.phase === "Setup"
      ? (wizardStep ?? "welcome")
      : wizardStep === "curated" || wizardStep === "choose"
        ? wizardStep
        : null;

  return {
    snapshot,
    bootError,
    wizardStep: effectiveWizard,
    showSettings,
    contentRoute,
    allowlistEntries,
    allowlistRepo,
    kv: sessionRef.current?.kv ?? null,
    tickNow,
    completeSetup,
    confirmWatching,
    changePolicy,
    resetCycle,
    openSettings: () => {
      setShowSettings(true);
      setContentRoute(null);
    },
    closeSettings: () => {
      setShowSettings(false);
      setContentRoute(null);
    },
    startSetup: () => setWizardStep("timerSetup"),
    openChoose: () => setContentRoute("choose"),
    closeContent: () => setContentRoute(null),
    goWizardCurated: () => setWizardStep("curated"),
    goWizardChoose: () => setWizardStep("choose"),
    finishWizard: () => setWizardStep(null),
    onAllowlistSaved: (entries) => {
      setAllowlistEntries(entries);
      setWizardStep(null);
      setContentRoute(null);
      setShowSettings(false);
    },
    onPlaylistsUpdated: (entries) => {
      setAllowlistEntries(entries);
      setContentRoute(null);
    },
    phoneUrl,
    phoneLinkOffline,
    bindPhonePlayback,
  };
}
