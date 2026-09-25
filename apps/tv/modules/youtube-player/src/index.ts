import { requireNativeModule, requireNativeViewManager } from "expo-modules-core";
import type { ComponentType, Ref } from "react";
import type { NativeSyntheticEvent, ViewProps } from "react-native";

export type PlayerEventPayload = {
  type: string;
  generation: number;
  state?: string;
  code?: number;
  raw?: string;
};

export type YoutubePlayerViewProps = ViewProps & {
  onPlayerEvent?: (event: NativeSyntheticEvent<PlayerEventPayload>) => void;
};

export type YoutubePlayerViewRef = {
  attach: () => Promise<void>;
  loadVideo: (videoId: string, startSeconds?: number) => Promise<void>;
  /** Playback position of the loaded video, in seconds. */
  currentTime: () => Promise<number>;
  pause: () => Promise<void>;
  play: () => Promise<void>;
  stop: () => Promise<void>;
  detachAndDestroy: () => Promise<void>;
  onHostPause: () => Promise<void>;
  onHostResume: () => Promise<void>;
  currentGeneration: () => Promise<number>;
};

type YoutubePlayerNativeModule = {
  moveTaskToBack: () => boolean;
};

const NativeModule =
  requireNativeModule<YoutubePlayerNativeModule>("YoutubePlayer");

export const YoutubePlayerView: ComponentType<
  YoutubePlayerViewProps & { ref?: Ref<YoutubePlayerViewRef> }
> = requireNativeViewManager("YoutubePlayer");

/** BACK while Playing: send task to background; watch clock keeps running. */
export function moveTaskToBack(): boolean {
  return NativeModule.moveTaskToBack();
}
