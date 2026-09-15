export { ENFORCEMENT_NOTE, PRODUCT_NAME } from "./product.js";
export {
  DEFAULT_POLICY,
  DEFAULT_REST_DURATION_MS,
  DEFAULT_WATCH_DURATION_MS,
  DURATION_STEP_MS,
  MS_PER_MINUTE,
  REST_MAX_MS,
  REST_MIN_MS,
  WATCH_MAX_MS,
  WATCH_MIN_MS,
  validatePolicy,
} from "./timer/policy.js";
export { freshPersistedTimer } from "./timer/defaults.js";
export { TimerEngine } from "./timer/timerEngine.js";
export type {
  PersistedTimer,
  PhaseChangeReason,
  TimeView,
  TimerCommandResult,
  TimerError,
  TimerEvent,
  TimerPhase,
  TimerPolicy,
  TimerSnapshot,
} from "./timer/types.js";
export {
  PIN_DK_LENGTH,
  PIN_ITERATIONS,
  PIN_PATTERN,
  PIN_SALT_LENGTH,
  hashPin,
  verifyPin,
} from "./pin/hasher.js";
export type { PinRecord } from "./pin/hasher.js";
export {
  LOCKOUT_AFTER_FAILURES,
  LOCKOUT_BASE_MS,
  LOCKOUT_CAP_MS,
  PinGate,
  emptyLockout,
} from "./pin/gate.js";
export type { PinError, PinLockout, PinResult } from "./pin/gate.js";
export {
  CATALOG_TTL_MS,
  PROBE_TTL_MS,
  allowlistEntryKey,
  isAllowlistEmpty,
  mergeAllowlist,
} from "./allowlist/types.js";
export type {
  AllowlistEntry,
  AllowlistError,
  AllowlistKind,
  AllowlistSource,
  ParsedYoutubeUrl,
} from "./allowlist/types.js";
export { parseYoutubeUrl } from "./allowlist/youtubeUrlParser.js";
export {
  classifyVideoProbe,
  noPlayableItem,
} from "./allowlist/playability.js";
export type { ProbeOutcome, VideoProbe } from "./allowlist/playability.js";
