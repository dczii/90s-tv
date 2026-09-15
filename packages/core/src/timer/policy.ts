import type { TimerPolicy } from "./types.js";

export const MS_PER_MINUTE = 60_000;

export const DEFAULT_WATCH_DURATION_MS = 15 * MS_PER_MINUTE;
export const DEFAULT_REST_DURATION_MS = 30 * MS_PER_MINUTE;

export const WATCH_MIN_MS = 5 * MS_PER_MINUTE;
export const WATCH_MAX_MS = 60 * MS_PER_MINUTE;
export const REST_MIN_MS = 5 * MS_PER_MINUTE;
export const REST_MAX_MS = 180 * MS_PER_MINUTE;
export const DURATION_STEP_MS = 5 * MS_PER_MINUTE;

export const DEFAULT_POLICY: TimerPolicy = {
  watchDurationMs: DEFAULT_WATCH_DURATION_MS,
  restDurationMs: DEFAULT_REST_DURATION_MS,
};

export function isOnStepGrid(valueMs: number): boolean {
  return valueMs % DURATION_STEP_MS === 0;
}

export type PolicyFieldError = {
  field: "watchDurationMs" | "restDurationMs";
  valueMs: number;
};

/** Returns the first out-of-range field, or null if valid (YT-D5). */
export function validatePolicy(policy: TimerPolicy): PolicyFieldError | null {
  const { watchDurationMs, restDurationMs } = policy;
  if (
    watchDurationMs < WATCH_MIN_MS ||
    watchDurationMs > WATCH_MAX_MS ||
    !isOnStepGrid(watchDurationMs)
  ) {
    return { field: "watchDurationMs", valueMs: watchDurationMs };
  }
  if (
    restDurationMs < REST_MIN_MS ||
    restDurationMs > REST_MAX_MS ||
    !isOnStepGrid(restDurationMs)
  ) {
    return { field: "restDurationMs", valueMs: restDurationMs };
  }
  return null;
}
