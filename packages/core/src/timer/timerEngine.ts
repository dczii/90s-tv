import { validatePolicy } from "./policy.js";
import type {
  PersistedTimer,
  PhaseChangeReason,
  TimeView,
  TimerCommandResult,
  TimerEvent,
  TimerPhase,
  TimerPolicy,
  TimerSnapshot,
} from "./types.js";

function floor0(n: number): number {
  return n < 0 ? 0 : n;
}

/**
 * Dual-clock TimerEngine (YT-D1–D5, YT-D8, YT-D12, YT-D13).
 * Time enters only as TimeView. tick is the only expiry path.
 */
export class TimerEngine {
  private state: PersistedTimer;
  /** When bootCount stays null, rewrite monotonic fields at most once/process. */
  private monotonicRewriteDoneThisProcess = false;
  /** Set by changePolicy when remaining hits 0; consumed by the next tick. */
  private pendingPolicyExpiry = false;

  constructor(initial: PersistedTimer) {
    this.state = clonePersisted(initial);
  }

  snapshot(now: TimeView): TimerSnapshot {
    const working = this.recoverCopy(now);
    return this.snapshotOf(working, now);
  }

  tick(now: TimeView): TimerEvent {
    const wallRecoveryPending = this.needsWallRecovery(now, this.state);
    this.applyRecovery(now);
    const expired = this.expireIfNeeded(now, wallRecoveryPending);
    if (expired) {
      return expired;
    }
    return { kind: "Unchanged", snapshot: this.snapshotOf(this.state, now) };
  }

  completeSetup(policy: TimerPolicy, now: TimeView): TimerCommandResult {
    this.applyRecovery(now);
    if (this.state.phase !== "Setup") {
      return rejectedIllegal(this.state.phase, "completeSetup");
    }
    const bad = validatePolicy(policy);
    if (bad) {
      return {
        kind: "Rejected",
        error: {
          kind: "PolicyOutOfRange",
          field: bad.field,
          valueMs: bad.valueMs,
        },
      };
    }
    this.state.policy = { ...policy };
    this.clearDeadlines();
    this.clearPhaseStart();
    return this.applyTransition(
      "Setup",
      "AwaitingConfirmation",
      "SetupCompleted",
      now,
    );
  }

  confirmWatching(now: TimeView): TimerCommandResult {
    this.applyRecovery(now);
    if (this.state.phase !== "AwaitingConfirmation") {
      return rejectedIllegal(this.state.phase, "confirmWatching");
    }
    const { watchDurationMs } = this.state.policy;
    this.state.watchDeadlineElapsedMs = now.elapsedRealtimeMs + watchDurationMs;
    this.state.watchDeadlineWallMs = now.wallClockMs + watchDurationMs;
    this.state.restDeadlineElapsedMs = null;
    this.state.restDeadlineWallMs = null;
    this.state.phaseStartElapsedMs = now.elapsedRealtimeMs;
    this.state.phaseStartWallMs = now.wallClockMs;
    this.state.deadlineBootCount = now.bootCount;
    return this.applyTransition(
      "AwaitingConfirmation",
      "Playing",
      "WatchConfirmed",
      now,
    );
  }

  changePolicy(policy: TimerPolicy, now: TimeView): TimerCommandResult {
    this.applyRecovery(now);
    if (this.state.phase === "Setup") {
      return {
        kind: "Rejected",
        error: { kind: "SetupIncomplete" },
      };
    }
    const bad = validatePolicy(policy);
    if (bad) {
      return {
        kind: "Rejected",
        error: {
          kind: "PolicyOutOfRange",
          field: bad.field,
          valueMs: bad.valueMs,
        },
      };
    }

    const phase = this.state.phase;
    this.state.policy = { ...policy };

    if (phase === "Playing") {
      const startE = this.state.phaseStartElapsedMs;
      const startW = this.state.phaseStartWallMs;
      if (startE != null) {
        this.state.watchDeadlineElapsedMs = startE + policy.watchDurationMs;
      }
      if (startW != null) {
        this.state.watchDeadlineWallMs = startW + policy.watchDurationMs;
      }
      // Rest deadline is not moved while Playing (YT-D12).
      if (this.remainingForPhase(this.state, now, "Playing") <= 0) {
        this.pendingPolicyExpiry = true;
      }
    } else if (phase === "Resting") {
      const startE = this.state.phaseStartElapsedMs;
      const startW = this.state.phaseStartWallMs;
      if (startE != null) {
        this.state.restDeadlineElapsedMs = startE + policy.restDurationMs;
      }
      if (startW != null) {
        this.state.restDeadlineWallMs = startW + policy.restDurationMs;
      }
      if (this.remainingForPhase(this.state, now, "Resting") <= 0) {
        this.pendingPolicyExpiry = true;
      }
    }
    // AwaitingConfirmation: store policy only; no deadlines.

    return {
      kind: "Applied",
      event: { kind: "Unchanged", snapshot: this.snapshotOf(this.state, now) },
    };
  }

  resetCycle(now: TimeView): TimerCommandResult {
    this.applyRecovery(now);
    if (this.state.phase === "Setup") {
      return rejectedIllegal(this.state.phase, "resetCycle");
    }
    const from = this.state.phase;
    this.clearDeadlines();
    this.clearPhaseStart();
    if (from === "AwaitingConfirmation") {
      return {
        kind: "Applied",
        event: {
          kind: "Unchanged",
          snapshot: this.snapshotOf(this.state, now),
        },
      };
    }
    return this.applyTransition(from, "AwaitingConfirmation", "CycleReset", now);
  }

  persisted(): PersistedTimer {
    return clonePersisted(this.state);
  }

  private applyTransition(
    from: TimerPhase,
    to: TimerPhase,
    reason: PhaseChangeReason,
    now: TimeView,
  ): TimerCommandResult {
    this.state.phase = to;
    const snapshot = this.snapshotOf(this.state, now);
    return {
      kind: "Applied",
      event: { kind: "PhaseChanged", from, to, snapshot, reason },
    };
  }

  private expireIfNeeded(
    now: TimeView,
    wallRecoveryPending: boolean,
  ): TimerEvent | null {
    const phase = this.state.phase;
    if (phase === "Playing") {
      const remaining = this.remainingForPhase(this.state, now, "Playing");
      if (remaining > 0) return null;
      return this.expireWatch(now, wallRecoveryPending);
    }
    if (phase === "Resting") {
      const remaining = this.remainingForPhase(this.state, now, "Resting");
      if (remaining > 0) return null;
      return this.expireRest(now);
    }
    return null;
  }

  private expireWatch(now: TimeView, wallRecoveryPending: boolean): TimerEvent {
    const from: TimerPhase = "Playing";
    const watchE = this.state.watchDeadlineElapsedMs;
    const watchW = this.state.watchDeadlineWallMs;
    const restMs = this.state.policy.restDurationMs;

    // Rest anchors at the watch-expiry instant (YT-D3), not restore-now.
    // After a wall recovery that already collapsed a past monotonic watch
    // deadline to "now", derive rest from the wall watch deadline.
    const restW = watchW != null ? watchW + restMs : null;
    let restE: number | null;
    if (wallRecoveryPending && restW != null) {
      restE = now.elapsedRealtimeMs + floor0(restW - now.wallClockMs);
    } else {
      restE = watchE != null ? watchE + restMs : null;
    }
    this.state.restDeadlineElapsedMs = restE;
    this.state.restDeadlineWallMs = restW;
    if (wallRecoveryPending && watchW != null) {
      this.state.phaseStartWallMs = watchW;
      this.state.phaseStartElapsedMs =
        now.elapsedRealtimeMs - (now.wallClockMs - watchW);
    } else {
      this.state.phaseStartElapsedMs = watchE;
      this.state.phaseStartWallMs = watchW;
    }

    const restRemaining = this.remainingForPhase(
      { ...this.state, phase: "Resting" },
      now,
      "Resting",
    );

    if (restRemaining <= 0) {
      this.clearDeadlines();
      this.clearPhaseStart();
      this.state.phase = "AwaitingConfirmation";
      this.pendingPolicyExpiry = false;
      return {
        kind: "PhaseChanged",
        from,
        to: "AwaitingConfirmation",
        snapshot: this.snapshotOf(this.state, now),
        reason: "RecoveredPastRest",
      };
    }

    this.state.phase = "Resting";
    let reason: PhaseChangeReason = "WatchExpired";
    if (this.pendingPolicyExpiry) {
      reason = "PolicyExpiredCurrentPhase";
      this.pendingPolicyExpiry = false;
    } else if (wallRecoveryPending) {
      reason = "RecoveredPastWatch";
    }
    return {
      kind: "PhaseChanged",
      from,
      to: "Resting",
      snapshot: this.snapshotOf(this.state, now),
      reason,
    };
  }

  private expireRest(now: TimeView): TimerEvent {
    const from: TimerPhase = "Resting";
    const reason: PhaseChangeReason = this.pendingPolicyExpiry
      ? "PolicyExpiredCurrentPhase"
      : "RestExpired";
    this.pendingPolicyExpiry = false;
    this.clearDeadlines();
    this.clearPhaseStart();
    this.state.phase = "AwaitingConfirmation";
    return {
      kind: "PhaseChanged",
      from,
      to: "AwaitingConfirmation",
      snapshot: this.snapshotOf(this.state, now),
      reason,
    };
  }

  private snapshotOf(state: PersistedTimer, now: TimeView): TimerSnapshot {
    const remainingMs =
      state.phase === "Playing" || state.phase === "Resting"
        ? this.remainingForPhase(state, now, state.phase)
        : 0;
    return {
      phase: state.phase,
      policy: { ...state.policy },
      remainingMs,
      confirmationRequired: state.phase === "AwaitingConfirmation",
    };
  }

  private remainingForPhase(
    state: PersistedTimer,
    now: TimeView,
    phase: "Playing" | "Resting",
  ): number {
    const useWall = this.needsWallRecovery(now, state);
    if (phase === "Playing") {
      if (useWall) {
        return floor0((state.watchDeadlineWallMs ?? 0) - now.wallClockMs);
      }
      return floor0(
        (state.watchDeadlineElapsedMs ?? 0) - now.elapsedRealtimeMs,
      );
    }
    if (useWall) {
      return floor0((state.restDeadlineWallMs ?? 0) - now.wallClockMs);
    }
    return floor0((state.restDeadlineElapsedMs ?? 0) - now.elapsedRealtimeMs);
  }

  private needsWallRecovery(now: TimeView, state: PersistedTimer): boolean {
    if (now.bootCount == null) return true;
    if (state.deadlineBootCount == null) return true;
    if (now.bootCount !== state.deadlineBootCount) return true;
    if (
      state.phaseStartElapsedMs != null &&
      now.elapsedRealtimeMs < state.phaseStartElapsedMs
    ) {
      return true;
    }
    return false;
  }

  private recoverCopy(now: TimeView): PersistedTimer {
    const copy = clonePersisted(this.state);
    this.rewriteMonotonicInto(copy, now, /*mutateFlag*/ false);
    return copy;
  }

  private applyRecovery(now: TimeView): void {
    this.rewriteMonotonicInto(this.state, now, /*mutateFlag*/ true);
  }

  private rewriteMonotonicInto(
    state: PersistedTimer,
    now: TimeView,
    mutateFlag: boolean,
  ): void {
    if (!this.needsWallRecovery(now, state)) return;
    // Null bootCount matches the reboot predicate forever; rewrite once/process.
    if (now.bootCount == null && this.monotonicRewriteDoneThisProcess) return;

    if (state.watchDeadlineWallMs != null) {
      state.watchDeadlineElapsedMs =
        now.elapsedRealtimeMs +
        floor0(state.watchDeadlineWallMs - now.wallClockMs);
    }
    if (state.restDeadlineWallMs != null) {
      state.restDeadlineElapsedMs =
        now.elapsedRealtimeMs +
        floor0(state.restDeadlineWallMs - now.wallClockMs);
    }
    if (state.phaseStartWallMs != null) {
      // May be negative after reboot when wall elapsed exceeds monotonic
      // uptime; required so YT-D12 preserves phase elapsed (not max(0)).
      state.phaseStartElapsedMs =
        now.elapsedRealtimeMs - (now.wallClockMs - state.phaseStartWallMs);
    } else if (state.phase === "Playing" || state.phase === "Resting") {
      state.phaseStartElapsedMs = now.elapsedRealtimeMs;
    }
    state.deadlineBootCount = now.bootCount;

    if (mutateFlag && now.bootCount == null) {
      this.monotonicRewriteDoneThisProcess = true;
    }
  }

  private clearDeadlines(): void {
    this.state.watchDeadlineElapsedMs = null;
    this.state.watchDeadlineWallMs = null;
    this.state.restDeadlineElapsedMs = null;
    this.state.restDeadlineWallMs = null;
    this.state.deadlineBootCount = null;
  }

  private clearPhaseStart(): void {
    this.state.phaseStartElapsedMs = null;
    this.state.phaseStartWallMs = null;
  }
}

function clonePersisted(p: PersistedTimer): PersistedTimer {
  return {
    phase: p.phase,
    policy: { ...p.policy },
    watchDeadlineElapsedMs: p.watchDeadlineElapsedMs,
    watchDeadlineWallMs: p.watchDeadlineWallMs,
    restDeadlineElapsedMs: p.restDeadlineElapsedMs,
    restDeadlineWallMs: p.restDeadlineWallMs,
    phaseStartElapsedMs: p.phaseStartElapsedMs,
    phaseStartWallMs: p.phaseStartWallMs,
    deadlineBootCount: p.deadlineBootCount,
  };
}

function rejectedIllegal(
  from: TimerPhase,
  attempted: string,
): TimerCommandResult {
  return {
    kind: "Rejected",
    error: { kind: "IllegalTransition", from, attempted },
  };
}
