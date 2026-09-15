/** Injected device clocks. Missing BOOT_COUNT is null, never 0. */
export type TimeView = {
  elapsedRealtimeMs: number;
  wallClockMs: number;
  bootCount: number | null;
};

export type TimerPhase =
  | "Setup"
  | "AwaitingConfirmation"
  | "Playing"
  | "Resting";

export type TimerPolicy = {
  watchDurationMs: number;
  restDurationMs: number;
};

export type PersistedTimer = {
  phase: TimerPhase;
  policy: TimerPolicy;
  watchDeadlineElapsedMs: number | null;
  watchDeadlineWallMs: number | null;
  restDeadlineElapsedMs: number | null;
  restDeadlineWallMs: number | null;
  phaseStartElapsedMs: number | null;
  phaseStartWallMs: number | null;
  deadlineBootCount: number | null;
};

export type TimerSnapshot = {
  phase: TimerPhase;
  policy: TimerPolicy;
  remainingMs: number;
  confirmationRequired: boolean;
};

export type PhaseChangeReason =
  | "SetupCompleted"
  | "WatchConfirmed"
  | "WatchExpired"
  | "RestExpired"
  | "CycleReset"
  | "RecoveredPastWatch"
  | "RecoveredPastRest"
  | "PolicyExpiredCurrentPhase";

export type TimerEvent =
  | { kind: "Unchanged"; snapshot: TimerSnapshot }
  | {
      kind: "PhaseChanged";
      from: TimerPhase;
      to: TimerPhase;
      snapshot: TimerSnapshot;
      reason: PhaseChangeReason;
    };

export type TimerError =
  | { kind: "SetupIncomplete" }
  | { kind: "PolicyOutOfRange"; field: string; valueMs: number }
  | { kind: "IllegalTransition"; from: TimerPhase; attempted: string };

export type TimerCommandResult =
  | { kind: "Applied"; event: TimerEvent }
  | { kind: "Rejected"; error: TimerError };
