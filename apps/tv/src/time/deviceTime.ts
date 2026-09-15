import type { TimeView } from "@littleplay/core";
import { nativeDeviceTime } from "device-time";

/** Maps the native module into core's TimeView (RN-D12). */
export function deviceTime(): TimeView {
  const raw = nativeDeviceTime();
  return {
    elapsedRealtimeMs: raw.elapsedRealtimeMs,
    wallClockMs: raw.wallClockMs,
    bootCount: raw.bootCount ?? null,
  };
}

export { addActivityResumeListener } from "device-time";
