import { NativeModule, requireNativeModule } from "expo-modules-core";
import type { EventSubscription } from "expo-modules-core";

export type DeviceTimeRaw = {
  elapsedRealtimeMs: number;
  wallClockMs: number;
  bootCount: number | null;
};

type DeviceTimeEvents = {
  onActivityResume: () => void;
};

declare class DeviceTimeNativeModule extends NativeModule<DeviceTimeEvents> {
  deviceTime(): {
    elapsedRealtimeMs: number;
    wallClockMs: number;
    bootCount?: number | null;
  };
}

const DeviceTime = requireNativeModule<DeviceTimeNativeModule>("DeviceTime");

export function nativeDeviceTime(): DeviceTimeRaw {
  const raw = DeviceTime.deviceTime();
  return {
    elapsedRealtimeMs: raw.elapsedRealtimeMs,
    wallClockMs: raw.wallClockMs,
    bootCount: raw.bootCount ?? null,
  };
}

export function addActivityResumeListener(
  listener: () => void,
): EventSubscription {
  return DeviceTime.addListener("onActivityResume", listener);
}
