import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
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
    const onResume = () => tickNow();
    const sub = addActivityResumeListener(onResume);
    const appSub = AppState.addEventListener(
      "change",
      (next: AppStateStatus) => {
        if (next === "active") onResume();
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
  }, [tickNow]);

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
  };
}
