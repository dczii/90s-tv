import { DEFAULT_POLICY } from "./policy.js";
import type { PersistedTimer } from "./types.js";

/** Fresh install: Setup, default policy, no deadlines (YT-D1). */
export function freshPersistedTimer(): PersistedTimer {
  return {
    phase: "Setup",
    policy: { ...DEFAULT_POLICY },
    watchDeadlineElapsedMs: null,
    watchDeadlineWallMs: null,
    restDeadlineElapsedMs: null,
    restDeadlineWallMs: null,
    phaseStartElapsedMs: null,
    phaseStartWallMs: null,
    deadlineBootCount: null,
  };
}
