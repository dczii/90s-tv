import { describe, expect, it } from "vitest";
import { freshPersistedTimer } from "./defaults.js";
import {
  DEFAULT_POLICY,
  DEFAULT_REST_DURATION_MS,
  DEFAULT_WATCH_DURATION_MS,
  MS_PER_MINUTE,
  validatePolicy,
} from "./policy.js";
import { TimerEngine } from "./timerEngine.js";
import type { PersistedTimer, TimeView, TimerPolicy } from "./types.js";

function time(
  elapsedRealtimeMs: number,
  wallClockMs: number,
  bootCount: number | null = 1,
): TimeView {
  return { elapsedRealtimeMs, wallClockMs, bootCount };
}

function policy(watchMin: number, restMin: number): TimerPolicy {
  return {
    watchDurationMs: watchMin * MS_PER_MINUTE,
    restDurationMs: restMin * MS_PER_MINUTE,
  };
}

function playingAt(
  start: TimeView,
  watchMs = DEFAULT_WATCH_DURATION_MS,
  restMs = DEFAULT_REST_DURATION_MS,
): TimerEngine {
  const engine = new TimerEngine(freshPersistedTimer());
  const setup = engine.completeSetup(
    { watchDurationMs: watchMs, restDurationMs: restMs },
    start,
  );
  expect(setup.kind).toBe("Applied");
  const confirm = engine.confirmWatching(start);
  expect(confirm.kind).toBe("Applied");
  return engine;
}

describe("TimerPolicy grid (YT-D5)", () => {
  it("accepts defaults and rejects off-grid / out of range", () => {
    expect(validatePolicy(DEFAULT_POLICY)).toBeNull();
    expect(
      validatePolicy({
        watchDurationMs: 90_000,
        restDurationMs: 30 * MS_PER_MINUTE,
      })?.field,
    ).toBe("watchDurationMs");
    expect(validatePolicy(policy(5, 181))?.field).toBe("restDurationMs");
    expect(validatePolicy(policy(0, 30))?.field).toBe("watchDurationMs");
    expect(validatePolicy(policy(1, 1))).toBeNull();
  });
});

describe("TimerEngine phase arrows", () => {
  it("Setup → AwaitingConfirmation → Playing → Resting → AwaitingConfirmation", () => {
    let now = time(0, 1_000_000);
    const engine = new TimerEngine(freshPersistedTimer());
    expect(engine.snapshot(now).phase).toBe("Setup");
    expect(engine.snapshot(now).remainingMs).toBe(0);

    const setup = engine.completeSetup(DEFAULT_POLICY, now);
    expect(setup.kind).toBe("Applied");
    if (setup.kind === "Applied" && setup.event.kind === "PhaseChanged") {
      expect(setup.event.reason).toBe("SetupCompleted");
      expect(setup.event.to).toBe("AwaitingConfirmation");
    }
    expect(engine.snapshot(now).confirmationRequired).toBe(true);
    expect(engine.snapshot(now).remainingMs).toBe(0);

    const confirm = engine.confirmWatching(now);
    expect(confirm.kind).toBe("Applied");
    if (confirm.kind === "Applied" && confirm.event.kind === "PhaseChanged") {
      expect(confirm.event.reason).toBe("WatchConfirmed");
    }
    expect(engine.snapshot(now).remainingMs).toBe(DEFAULT_WATCH_DURATION_MS);
    expect(engine.persisted().phaseStartElapsedMs).toBe(0);
    expect(engine.persisted().phaseStartWallMs).toBe(1_000_000);

    now = time(DEFAULT_WATCH_DURATION_MS, 1_000_000 + DEFAULT_WATCH_DURATION_MS);
    const watchExp = engine.tick(now);
    expect(watchExp.kind).toBe("PhaseChanged");
    if (watchExp.kind === "PhaseChanged") {
      expect(watchExp.to).toBe("Resting");
      expect(watchExp.reason).toBe("WatchExpired");
      expect(watchExp.snapshot.remainingMs).toBe(DEFAULT_REST_DURATION_MS);
    }
    expect(engine.persisted().phaseStartElapsedMs).toBe(DEFAULT_WATCH_DURATION_MS);
    expect(engine.persisted().phaseStartWallMs).toBe(
      1_000_000 + DEFAULT_WATCH_DURATION_MS,
    );

    now = time(
      DEFAULT_WATCH_DURATION_MS + DEFAULT_REST_DURATION_MS,
      1_000_000 + DEFAULT_WATCH_DURATION_MS + DEFAULT_REST_DURATION_MS,
    );
    const restExp = engine.tick(now);
    expect(restExp.kind).toBe("PhaseChanged");
    if (restExp.kind === "PhaseChanged") {
      expect(restExp.to).toBe("AwaitingConfirmation");
      expect(restExp.reason).toBe("RestExpired");
    }
    expect(engine.persisted().phaseStartElapsedMs).toBeNull();
  });

  it("rejects illegal transitions", () => {
    const now = time(0, 0);
    const engine = new TimerEngine(freshPersistedTimer());
    expect(engine.confirmWatching(now).kind).toBe("Rejected");
    expect(engine.resetCycle(now).kind).toBe("Rejected");
    engine.completeSetup(DEFAULT_POLICY, now);
    expect(engine.completeSetup(DEFAULT_POLICY, now).kind).toBe("Rejected");
    const rejected = engine.confirmWatching(now);
    expect(rejected.kind).toBe("Applied");
    expect(engine.completeSetup(DEFAULT_POLICY, now).kind).toBe("Rejected");
  });

  it("confirmWatching starts remaining at watchDurationMs; Setup/Awaiting do not tick time", () => {
    let now = time(100, 5_000);
    const engine = new TimerEngine(freshPersistedTimer());
    engine.completeSetup(policy(15, 30), now);
    now = time(100 + 10 * MS_PER_MINUTE, 5_000 + 10 * MS_PER_MINUTE);
    expect(engine.snapshot(now).remainingMs).toBe(0);
    expect(engine.tick(now).kind).toBe("Unchanged");
    const confirm = engine.confirmWatching(now);
    expect(confirm.kind).toBe("Applied");
    expect(engine.snapshot(now).remainingMs).toBe(15 * MS_PER_MINUTE);
  });
});

describe("dual-clock remaining", () => {
  it("advancing elapsedRealtime without wall still expires in-boot", () => {
    const start = time(0, 1_000_000, 3);
    const engine = playingAt(start);
    const later = time(DEFAULT_WATCH_DURATION_MS, 1_000_000, 3);
    const event = engine.tick(later);
    expect(event.kind).toBe("PhaseChanged");
    if (event.kind === "PhaseChanged") expect(event.to).toBe("Resting");
  });

  it("advancing wall without elapsed leaves in-boot remaining unchanged", () => {
    const start = time(0, 1_000_000, 3);
    const engine = playingAt(start);
    const later = time(0, 1_000_000 + 10 * MS_PER_MINUTE, 3);
    expect(engine.snapshot(later).remainingMs).toBe(DEFAULT_WATCH_DURATION_MS);
    expect(engine.tick(later).kind).toBe("Unchanged");
  });

  it("same-boot kill/restore matches remaining", () => {
    const start = time(1_000, 2_000_000, 2);
    const engine = playingAt(start);
    const mid = time(1_000 + 5 * MS_PER_MINUTE, 2_000_000 + 5 * MS_PER_MINUTE, 2);
    const remaining = engine.snapshot(mid).remainingMs;
    expect(remaining).toBe(10 * MS_PER_MINUTE);
    const restored = new TimerEngine(engine.persisted());
    expect(restored.snapshot(mid).remainingMs).toBe(remaining);
  });

  it("reboot recovers from wall and does not grant a fresh window", () => {
    const start = time(0, 10_000_000, 1);
    const engine = playingAt(start);
    const persisted = engine.persisted();
    const reboot = time(0, 10_000_000 + 5 * MS_PER_MINUTE, 2);
    const restored = new TimerEngine(persisted);
    const event = restored.tick(reboot);
    expect(event.kind).toBe("Unchanged");
    expect(restored.snapshot(reboot).remainingMs).toBe(10 * MS_PER_MINUTE);
    expect(restored.persisted().deadlineBootCount).toBe(2);
    expect(restored.persisted().watchDeadlineElapsedMs).toBe(10 * MS_PER_MINUTE);
  });

  it("kill across watch deadline lands in Resting anchored at watch expiry", () => {
    const start = time(0, 1_000_000, 1);
    const engine = playingAt(start, 15 * MS_PER_MINUTE, 30 * MS_PER_MINUTE);
    const afterWatch = time(
      15 * MS_PER_MINUTE + 5 * MS_PER_MINUTE,
      1_000_000 + 15 * MS_PER_MINUTE + 5 * MS_PER_MINUTE,
      1,
    );
    const restored = new TimerEngine(engine.persisted());
    const event = restored.tick(afterWatch);
    expect(event.kind).toBe("PhaseChanged");
    if (event.kind === "PhaseChanged") {
      expect(event.to).toBe("Resting");
      // 30 rest − 5 past watch = 25 remaining, not 30 from restore-now
      expect(event.snapshot.remainingMs).toBe(25 * MS_PER_MINUTE);
    }
  });

  it("kill across watch+rest lands on AwaitingConfirmation without autoplay", () => {
    const start = time(0, 1_000_000, 1);
    const engine = playingAt(start, 15 * MS_PER_MINUTE, 30 * MS_PER_MINUTE);
    const afterBoth = time(
      15 * MS_PER_MINUTE + 30 * MS_PER_MINUTE + 1,
      1_000_000 + 15 * MS_PER_MINUTE + 30 * MS_PER_MINUTE + 1,
      1,
    );
    const restored = new TimerEngine(engine.persisted());
    const event = restored.tick(afterBoth);
    expect(event.kind).toBe("PhaseChanged");
    if (event.kind === "PhaseChanged") {
      expect(event.to).toBe("AwaitingConfirmation");
      expect(event.reason).toBe("RecoveredPastRest");
    }
  });
});

describe("YT-D12 duration change", () => {
  it("preserves elapsed: 15 watch, 10 elapsed, change to 20 → remaining 10", () => {
    const start = time(0, 0, 1);
    const engine = playingAt(start, 15 * MS_PER_MINUTE, 30 * MS_PER_MINUTE);
    const mid = time(10 * MS_PER_MINUTE, 10 * MS_PER_MINUTE, 1);
    const result = engine.changePolicy(policy(20, 30), mid);
    expect(result.kind).toBe("Applied");
    expect(engine.snapshot(mid).remainingMs).toBe(10 * MS_PER_MINUTE);
  });

  it("decreasing below elapsed → remaining 0 and next tick rests with PolicyExpiredCurrentPhase", () => {
    const start = time(0, 0, 1);
    const engine = playingAt(start, 15 * MS_PER_MINUTE, 30 * MS_PER_MINUTE);
    const mid = time(10 * MS_PER_MINUTE, 10 * MS_PER_MINUTE, 1);
    engine.changePolicy(policy(5, 30), mid);
    expect(engine.snapshot(mid).remainingMs).toBe(0);
    const event = engine.tick(mid);
    expect(event.kind).toBe("PhaseChanged");
    if (event.kind === "PhaseChanged") {
      expect(event.to).toBe("Resting");
      expect(event.reason).toBe("PolicyExpiredCurrentPhase");
    }
  });

  it("changing rest during Playing does not move the watch deadline", () => {
    const start = time(0, 0, 1);
    const engine = playingAt(start, 15 * MS_PER_MINUTE, 30 * MS_PER_MINUTE);
    const before = engine.persisted().watchDeadlineElapsedMs;
    const mid = time(2 * MS_PER_MINUTE, 2 * MS_PER_MINUTE, 1);
    engine.changePolicy(policy(15, 60), mid);
    expect(engine.persisted().watchDeadlineElapsedMs).toBe(before);
  });

  it("reboot then changePolicy still preserves elapsed after wall rewrite", () => {
    const start = time(0, 1_000_000, 1);
    const engine = playingAt(start, 15 * MS_PER_MINUTE, 30 * MS_PER_MINUTE);
    const persisted = engine.persisted();
    const reboot = time(0, 1_000_000 + 5 * MS_PER_MINUTE, 2);
    const restored = new TimerEngine(persisted);
    restored.tick(reboot);
    restored.changePolicy(policy(20, 30), reboot);
    expect(restored.snapshot(reboot).remainingMs).toBe(15 * MS_PER_MINUTE);
  });
});

describe("resetCycle and phaseStart", () => {
  it("resetCycle from AwaitingConfirmation emits Unchanged; PhaseChanged only when from != to", () => {
    const now = time(0, 0, 1);
    const engine = new TimerEngine(freshPersistedTimer());
    engine.completeSetup(DEFAULT_POLICY, now);
    const result = engine.resetCycle(now);
    expect(result.kind).toBe("Applied");
    if (result.kind === "Applied") {
      expect(result.event.kind).toBe("Unchanged");
    }
  });

  it("resetCycle from Playing clears deadlines and phaseStart", () => {
    const start = time(0, 0, 1);
    const engine = playingAt(start);
    const mid = time(1_000, 1_000, 1);
    const result = engine.resetCycle(mid);
    expect(result.kind).toBe("Applied");
    if (result.kind === "Applied" && result.event.kind === "PhaseChanged") {
      expect(result.event.to).toBe("AwaitingConfirmation");
      expect(result.event.reason).toBe("CycleReset");
    }
    expect(engine.persisted().watchDeadlineElapsedMs).toBeNull();
    expect(engine.persisted().phaseStartElapsedMs).toBeNull();
  });

  it("changePolicy in Setup is SetupIncomplete; AwaitingConfirmation stores policy only", () => {
    const now = time(0, 0, 1);
    const engine = new TimerEngine(freshPersistedTimer());
    expect(engine.changePolicy(DEFAULT_POLICY, now).kind).toBe("Rejected");
    engine.completeSetup(DEFAULT_POLICY, now);
    const changed = engine.changePolicy(policy(20, 40), now);
    expect(changed.kind).toBe("Applied");
    expect(engine.persisted().policy.watchDurationMs).toBe(20 * MS_PER_MINUTE);
    expect(engine.persisted().watchDeadlineElapsedMs).toBeNull();
  });
});

describe("null bootCount rewrite once (YT-D13)", () => {
  it("rewrites monotonic fields on first tick, not the second 1 Hz tick", () => {
    const start = time(0, 1_000_000, 1);
    const engine = playingAt(start);
    const persisted = engine.persisted();
    const restored = new TimerEngine(persisted);
    const t1 = time(50, 1_000_000 + 5 * MS_PER_MINUTE, null);
    restored.tick(t1);
    const afterFirst = restored.persisted().watchDeadlineElapsedMs;
    expect(afterFirst).toBe(10 * MS_PER_MINUTE + 50);
    const t2 = time(1_050, 1_000_000 + 5 * MS_PER_MINUTE + 1_000, null);
    restored.tick(t2);
    expect(restored.persisted().watchDeadlineElapsedMs).toBe(afterFirst);
  });
});

describe("policy validation on commands", () => {
  it("rejects PolicyOutOfRange on completeSetup and changePolicy", () => {
    const now = time(0, 0, 1);
    const engine = new TimerEngine(freshPersistedTimer());
    const bad = engine.completeSetup(
      {
        watchDurationMs: 90_000,
        restDurationMs: 30 * MS_PER_MINUTE,
      },
      now,
    );
    expect(bad.kind).toBe("Rejected");
    if (bad.kind === "Rejected") expect(bad.error.kind).toBe("PolicyOutOfRange");
    engine.completeSetup(DEFAULT_POLICY, now);
    const bad2 = engine.changePolicy(policy(15, 181), now);
    expect(bad2.kind).toBe("Rejected");
  });
});

describe("coverage edges", () => {
  it("rest duration change during Resting recomputes rest deadline", () => {
    const start = time(0, 0, 1);
    const engine = playingAt(start, 5 * MS_PER_MINUTE, 30 * MS_PER_MINUTE);
    engine.tick(time(5 * MS_PER_MINUTE, 5 * MS_PER_MINUTE, 1));
    expect(engine.snapshot(time(5 * MS_PER_MINUTE, 5 * MS_PER_MINUTE, 1)).phase).toBe(
      "Resting",
    );
    const mid = time(5 * MS_PER_MINUTE + 10 * MS_PER_MINUTE, 15 * MS_PER_MINUTE, 1);
    engine.changePolicy(policy(5, 60), mid);
    expect(engine.snapshot(mid).remainingMs).toBe(50 * MS_PER_MINUTE);
  });

  it("elapsed wrap detects reboot even when bootCount matches", () => {
    const start = time(10_000, 1_000_000, 1);
    const engine = playingAt(start);
    const wrap = time(100, 1_000_000 + 2 * MS_PER_MINUTE, 1);
    const event = engine.tick(wrap);
    expect(event.kind).toBe("Unchanged");
    expect(engine.snapshot(wrap).remainingMs).toBe(13 * MS_PER_MINUTE);
  });

  it("hydrates arbitrary PersistedTimer for Resting recovery", () => {
    const state: PersistedTimer = {
      phase: "Resting",
      policy: DEFAULT_POLICY,
      watchDeadlineElapsedMs: 100,
      watchDeadlineWallMs: 1_000_100,
      restDeadlineElapsedMs: 100 + DEFAULT_REST_DURATION_MS,
      restDeadlineWallMs: 1_000_100 + DEFAULT_REST_DURATION_MS,
      phaseStartElapsedMs: 100,
      phaseStartWallMs: 1_000_100,
      deadlineBootCount: 1,
    };
    const engine = new TimerEngine(state);
    const past = time(
      100 + DEFAULT_REST_DURATION_MS + 1,
      1_000_100 + DEFAULT_REST_DURATION_MS + 1,
      1,
    );
    const event = engine.tick(past);
    expect(event.kind).toBe("PhaseChanged");
    if (event.kind === "PhaseChanged") {
      expect(event.reason).toBe("RestExpired");
    }
  });

  it("reboots during Resting rewriting rest monotonic deadline", () => {
    const start = time(0, 1_000_000, 1);
    const engine = playingAt(start, 5 * MS_PER_MINUTE, 30 * MS_PER_MINUTE);
    engine.tick(time(5 * MS_PER_MINUTE, 1_000_000 + 5 * MS_PER_MINUTE, 1));
    const persisted = engine.persisted();
    expect(persisted.phase).toBe("Resting");
    const reboot = time(0, 1_000_000 + 5 * MS_PER_MINUTE + 10 * MS_PER_MINUTE, 9);
    const restored = new TimerEngine(persisted);
    const event = restored.tick(reboot);
    expect(event.kind).toBe("Unchanged");
    expect(restored.snapshot(reboot).remainingMs).toBe(20 * MS_PER_MINUTE);
    expect(restored.persisted().restDeadlineElapsedMs).toBe(20 * MS_PER_MINUTE);
  });

  it("rewrites phaseStart from now when phaseStartWallMs is missing", () => {
    const state: PersistedTimer = {
      phase: "Playing",
      policy: DEFAULT_POLICY,
      watchDeadlineElapsedMs: 15 * MS_PER_MINUTE,
      watchDeadlineWallMs: 1_000_000 + 15 * MS_PER_MINUTE,
      restDeadlineElapsedMs: null,
      restDeadlineWallMs: null,
      phaseStartElapsedMs: null,
      phaseStartWallMs: null,
      deadlineBootCount: null,
    };
    const engine = new TimerEngine(state);
    const now = time(100, 1_000_000 + 2 * MS_PER_MINUTE, 3);
    engine.tick(now);
    expect(engine.persisted().phaseStartElapsedMs).toBe(100);
    expect(engine.persisted().deadlineBootCount).toBe(3);
  });

  it("PolicyExpiredCurrentPhase on Resting when rest shortened below elapsed", () => {
    const start = time(0, 0, 1);
    const engine = playingAt(start, 5 * MS_PER_MINUTE, 30 * MS_PER_MINUTE);
    engine.tick(time(5 * MS_PER_MINUTE, 5 * MS_PER_MINUTE, 1));
    const mid = time(5 * MS_PER_MINUTE + 20 * MS_PER_MINUTE, 25 * MS_PER_MINUTE, 1);
    engine.changePolicy(policy(5, 10), mid);
    expect(engine.snapshot(mid).remainingMs).toBe(0);
    const event = engine.tick(mid);
    expect(event.kind).toBe("PhaseChanged");
    if (event.kind === "PhaseChanged") {
      expect(event.reason).toBe("PolicyExpiredCurrentPhase");
      expect(event.to).toBe("AwaitingConfirmation");
    }
  });

  it("snapshot after null-boot rewrite uses wall without rewriting again", () => {
    const start = time(0, 1_000_000, 1);
    const engine = playingAt(start);
    const restored = new TimerEngine(engine.persisted());
    const t1 = time(10, 1_000_000 + MS_PER_MINUTE, null);
    restored.tick(t1);
    const snap = restored.snapshot(time(20, 1_000_000 + MS_PER_MINUTE + 5_000, null));
    expect(snap.remainingMs).toBe(DEFAULT_WATCH_DURATION_MS - MS_PER_MINUTE - 5_000);
  });

  it("RecoveredPastWatch reason on reboot past the watch deadline", () => {
    const start = time(0, 1_000_000, 1);
    const engine = playingAt(start, 15 * MS_PER_MINUTE, 30 * MS_PER_MINUTE);
    const rebootPast = time(
      0,
      1_000_000 + 15 * MS_PER_MINUTE + 2 * MS_PER_MINUTE,
      2,
    );
    const restored = new TimerEngine(engine.persisted());
    const event = restored.tick(rebootPast);
    expect(event.kind).toBe("PhaseChanged");
    if (event.kind === "PhaseChanged") {
      expect(event.reason).toBe("RecoveredPastWatch");
      expect(event.to).toBe("Resting");
      expect(event.snapshot.remainingMs).toBe(28 * MS_PER_MINUTE);
    }
  });

  it("Resting remaining uses wall when bootCount is permanently null", () => {
    const start = time(0, 1_000_000, 1);
    const engine = playingAt(start, 5 * MS_PER_MINUTE, 30 * MS_PER_MINUTE);
    engine.tick(time(5 * MS_PER_MINUTE, 1_000_000 + 5 * MS_PER_MINUTE, 1));
    const restored = new TimerEngine(engine.persisted());
    const nullBoot = time(0, 1_000_000 + 5 * MS_PER_MINUTE + 10 * MS_PER_MINUTE, null);
    restored.tick(nullBoot);
    expect(restored.snapshot(nullBoot).phase).toBe("Resting");
    expect(restored.snapshot(nullBoot).remainingMs).toBe(20 * MS_PER_MINUTE);
  });

  it("covers null deadline fallbacks while Playing and Resting", () => {
    const playingNull: PersistedTimer = {
      phase: "Playing",
      policy: DEFAULT_POLICY,
      watchDeadlineElapsedMs: null,
      watchDeadlineWallMs: null,
      restDeadlineElapsedMs: null,
      restDeadlineWallMs: null,
      phaseStartElapsedMs: 0,
      phaseStartWallMs: 0,
      deadlineBootCount: 1,
    };
    const engine = new TimerEngine(playingNull);
    const now = time(1_000, 1_000, 1);
    expect(engine.snapshot(now).remainingMs).toBe(0);
    const expired = engine.tick(now);
    expect(expired.kind).toBe("PhaseChanged");
    if (expired.kind === "PhaseChanged") {
      expect(expired.to).toBe("AwaitingConfirmation");
    }

    const restingNull: PersistedTimer = {
      phase: "Resting",
      policy: DEFAULT_POLICY,
      watchDeadlineElapsedMs: null,
      watchDeadlineWallMs: null,
      restDeadlineElapsedMs: null,
      restDeadlineWallMs: null,
      phaseStartElapsedMs: 0,
      phaseStartWallMs: 0,
      deadlineBootCount: 1,
    };
    const restEngine = new TimerEngine(restingNull);
    expect(restEngine.snapshot(now).remainingMs).toBe(0);
    const restExp = restEngine.tick(now);
    expect(restExp.kind).toBe("PhaseChanged");
    if (restExp.kind === "PhaseChanged") {
      expect(restExp.to).toBe("AwaitingConfirmation");
    }

    // Wall path with null rest/watch deadlines (null bootCount).
    const wallPlaying = new TimerEngine({
      ...playingNull,
      deadlineBootCount: null,
    });
    expect(wallPlaying.snapshot(time(0, 0, null)).remainingMs).toBe(0);
    const wallResting = new TimerEngine({
      ...restingNull,
      deadlineBootCount: null,
    });
    expect(wallResting.snapshot(time(0, 0, null)).remainingMs).toBe(0);
  });
});
