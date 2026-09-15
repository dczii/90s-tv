import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  PinGate,
  TimerEngine,
  emptyLockout,
  hashPin,
  PIN_ITERATIONS,
  type AllowlistEntry,
  type TimerEvent,
  type TimerSnapshot,
} from "@littleplay/core";
import { openLittlePlayDb, type AppDatabase } from "../data/openDb";
import { loadStore, savePin, saveTimer } from "../data/timerStore";
import type { AllowlistRepository } from "../data/allowlistRepo";
import type { SqliteKv } from "../data/sqliteKv";
import { addActivityResumeListener, deviceTime } from "../time/deviceTime";
import { hasStoredTokens } from "../secure/tokenStore";
import { randomPinSalt } from "../crypto/pinSalt";

export type WizardStep =
  | "welcome"
  | "timerSetup"
  | "connect"
  | "choose"
  | null;

export type AppSession = {
  engine: TimerEngine;
  pinGate: PinGate | null;
  kv: SqliteKv;
  allowlist: AllowlistRepository;
  firstTickDone: boolean;
};

function shouldPersistTick(event: TimerEvent, firstTickDone: boolean): boolean {
  if (event.kind === "PhaseChanged") return true;
  return !firstTickDone;
}

function shouldPersistCommand(_event: TimerEvent): boolean {
  return true;
}

export function createSession(): AppSession {
  const db: AppDatabase = openLittlePlayDb();
  const loaded = loadStore(db.kv);
  const engine = new TimerEngine(loaded.timer);
  const pinGate = loaded.pin
    ? new PinGate(loaded.pin, loaded.lockout)
    : null;
  return {
    engine,
    pinGate,
    kv: db.kv,
    allowlist: db.allowlist,
    firstTickDone: false,
  };
}

export type ContentRoute = "connect" | "choose" | null;

export type SessionApi = {
  snapshot: TimerSnapshot | null;
  bootError: string | null;
  pinPending: boolean;
  wizardStep: WizardStep;
  settingsUnlocked: boolean;
  showSettings: boolean;
  contentRoute: ContentRoute;
  allowlistEntries: AllowlistEntry[];
  allowlistRepo: AllowlistRepository | null;
  signedIn: boolean;
  kv: SqliteKv | null;
  tickNow: () => void;
  completeSetup: (
    watchMin: number,
    restMin: number,
    pin: string,
  ) => Promise<string | null>;
  confirmWatching: () => string | null;
  changePolicy: (watchMin: number, restMin: number) => string | null;
  resetCycle: () => string | null;
  verifyPin: (pin: string) => Promise<string | null>;
  openSettings: () => void;
  closeSettings: () => void;
  startSetup: () => void;
  openConnect: () => void;
  openChoose: () => void;
  closeContent: () => void;
  goWizardConnect: () => void;
  goWizardChoose: () => void;
  finishWizard: () => void;
  onAllowlistSaved: (entries: AllowlistEntry[]) => void;
  refreshSignedIn: () => Promise<void>;
};

export function useAppSession(): SessionApi {
  const sessionRef = useRef<AppSession | null>(null);
  const [snapshot, setSnapshot] = useState<TimerSnapshot | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [pinPending, setPinPending] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>("welcome");
  const [settingsUnlocked, setSettingsUnlocked] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [contentRoute, setContentRoute] = useState<ContentRoute>(null);
  const [allowlistEntries, setAllowlistEntries] = useState<AllowlistEntry[]>(
    [],
  );
  const [allowlistRepo, setAllowlistRepo] =
    useState<AllowlistRepository | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  const persistAll = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    saveTimer(session.kv, session.engine.persisted());
    if (session.pinGate) {
      savePin(
        session.kv,
        session.pinGate.pinRecord(),
        session.pinGate.lockout(),
      );
    }
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

  const refreshSignedIn = useCallback(async () => {
    setSignedIn(await hasStoredTokens());
  }, []);

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
      void refreshSignedIn();
      if (event.snapshot.phase !== "Setup") {
        setWizardStep(null);
      }
    } catch (err) {
      setBootError(err instanceof Error ? err.message : String(err));
    }
  }, [persistAll, refreshSignedIn]);

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
    async (watchMin: number, restMin: number, pin: string) => {
      const session = sessionRef.current;
      if (!session) return "Not ready";
      setPinPending(true);
      try {
        const salt = await randomPinSalt();
        // Full 120k rounds is very slow in Hermes on TV hardware; keep prod strength, speed dev.
        const iterations = __DEV__ ? 4_000 : PIN_ITERATIONS;
        const record = await hashPin(pin, salt, iterations);
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
        session.pinGate = new PinGate(record, emptyLockout());
        applyEvent(result.event, shouldPersistCommand(result.event));
        persistAll();
        // First-run wizard continues to Connect (not PIN-gated).
        setWizardStep("connect");
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      } finally {
        setPinPending(false);
      }
    },
    [applyEvent, persistAll],
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

  const verifyPin = useCallback(
    async (pin: string) => {
      const session = sessionRef.current;
      if (!session?.pinGate) return "PIN not set";
      setPinPending(true);
      try {
        const result = await session.pinGate.verify(pin, deviceTime());
        persistAll();
        if (result.kind === "Ok") {
          setSettingsUnlocked(true);
          return null;
        }
        if (result.error.kind === "LockedOut") {
          return `Locked out (${Math.ceil(result.error.remainingMs / 1000)}s)`;
        }
        return result.error.kind;
      } finally {
        setPinPending(false);
      }
    },
    [persistAll],
  );

  const effectiveWizard: WizardStep =
    snapshot?.phase === "Setup"
      ? (wizardStep ?? "welcome")
      : wizardStep === "connect" || wizardStep === "choose"
        ? wizardStep
        : null;

  return {
    snapshot,
    bootError,
    pinPending,
    wizardStep: effectiveWizard,
    settingsUnlocked,
    showSettings,
    contentRoute,
    allowlistEntries,
    allowlistRepo,
    signedIn,
    kv: sessionRef.current?.kv ?? null,
    tickNow,
    completeSetup,
    confirmWatching,
    changePolicy,
    resetCycle,
    verifyPin,
    openSettings: () => {
      setShowSettings(true);
      setSettingsUnlocked(false);
      setContentRoute(null);
    },
    closeSettings: () => {
      setShowSettings(false);
      setSettingsUnlocked(false);
      setContentRoute(null);
    },
    startSetup: () => setWizardStep("timerSetup"),
    openConnect: () => setContentRoute("connect"),
    openChoose: () => setContentRoute("choose"),
    closeContent: () => setContentRoute(null),
    goWizardConnect: () => setWizardStep("connect"),
    goWizardChoose: () => setWizardStep("choose"),
    finishWizard: () => setWizardStep(null),
    onAllowlistSaved: (entries) => {
      setAllowlistEntries(entries);
      setWizardStep(null);
      setContentRoute(null);
      setShowSettings(false);
    },
    refreshSignedIn,
  };
}
