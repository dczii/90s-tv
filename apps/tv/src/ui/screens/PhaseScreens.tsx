import { useEffect, useRef } from "react";
import {
  AppState,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
} from "react-native";
import type { TimerSnapshot } from "@littleplay/core";
import { YoutubePlayerView } from "youtube-player";
import { TvButton } from "../components/TvButton";
import { colors, safe } from "../../theme/tokens";
import type { PlayerSessionApi } from "../../player/PlayerSession";

type ReadyProps = {
  snapshot: TimerSnapshot;
  onContinue: () => void;
  onOpenSettings: () => void;
  allowlistEmpty?: boolean;
  continueBusy?: boolean;
  noPlayable?: boolean;
  continueError?: string | null;
};

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ReadyScreen({
  snapshot,
  onContinue,
  onOpenSettings,
  allowlistEmpty = false,
  continueBusy = false,
  noPlayable = false,
  continueError = null,
}: ReadyProps) {
  const watchMin = Math.round(snapshot.policy.watchDurationMs / 60_000);
  const disabled = allowlistEmpty || noPlayable || continueBusy;
  return (
    <View style={styles.shell} accessibilityLabel="Continue watching">
      <Text style={styles.title}>{watchMin} minutes available</Text>
      <Text style={styles.body}>
        Watching starts only when you press Continue watching.
        {allowlistEmpty
          ? " Add allowed videos in Parent settings before continuing."
          : ""}
        {noPlayable
          ? " None of the allowed items can play right now."
          : ""}
      </Text>
      {continueError ? <Text style={styles.warn}>{continueError}</Text> : null}
      <TvButton
        label={continueBusy ? "Checking…" : "Continue watching"}
        disabled={disabled}
        onPress={onContinue}
      />
      <TvButton
        label="Parent settings"
        variant="secondary"
        onPress={onOpenSettings}
      />
    </View>
  );
}

export function RestScreen({
  snapshot,
  onOpenSettings,
}: {
  snapshot: TimerSnapshot;
  onOpenSettings: () => void;
}) {
  const fraction = Math.max(
    0,
    Math.min(1, snapshot.remainingMs / snapshot.policy.restDurationMs),
  );
  return (
    <View
      style={styles.shell}
      accessibilityLabel="Rest timer"
      // Preferred focus lands here after destroy (YT-D25).
      {...({ hasTVPreferredFocus: true } as object)}
    >
      <Text style={styles.title}>Time for a break</Text>
      <View style={styles.ringWrap}>
        <View style={[styles.ringTrack, { opacity: 0.35 }]} />
        <View
          style={[
            styles.ringFill,
            {
              // Simple progress wedge substitute: opacity scales with remaining.
              opacity: 0.25 + fraction * 0.75,
              borderColor: colors.amber,
            },
          ]}
        />
        <Text style={styles.countdown}>{formatRemaining(snapshot.remainingMs)}</Text>
      </View>
      <Text style={styles.body}>
        When this timer reaches zero, Continue watching will be required before
        another watch window can start. The player is not present.
      </Text>
      <TvButton
        label="Parent settings"
        variant="secondary"
        onPress={onOpenSettings}
      />
    </View>
  );
}

type PlayingProps = {
  snapshot: TimerSnapshot;
  player: PlayerSessionApi;
  videoId: string | null;
  videoTitle: string | null;
  noPlayableSlate: boolean;
  showInfo: boolean;
};

export function PlayingShell({
  snapshot,
  player,
  videoId,
  videoTitle,
  noPlayableSlate,
  showInfo,
}: PlayingProps) {
  const last60 = snapshot.remainingMs <= 60_000;
  const loadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!player.attached || !videoId) return;
    if (loadedRef.current === videoId) return;
    loadedRef.current = videoId;
    void player.loadVideo(videoId);
  }, [player, player.attached, videoId]);

  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next === "background" || next === "inactive") {
        void player.onHostPause();
      } else if (next === "active") {
        void player.onHostResume();
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [player]);

  return (
    <View style={styles.playingRoot} accessibilityLabel="Playing">
      {player.attached && !noPlayableSlate ? (
        <YoutubePlayerView
          ref={player.nativeRef}
          style={styles.player}
          onPlayerEvent={player.onNativeEvent}
        />
      ) : (
        <View style={styles.slate}>
          <Text style={styles.title}>Nothing playable left</Text>
          <Text style={styles.body}>
            This watch window keeps counting down. Rest starts when time runs
            out.
          </Text>
        </View>
      )}
      <View
        style={[styles.pillWrap, last60 ? styles.pillAmber : null]}
        pointerEvents="none"
        {...({ focusable: false } as object)}
      >
        <Text style={styles.pillText}>
          {formatRemaining(snapshot.remainingMs)} left
        </Text>
      </View>
      {showInfo && videoTitle ? (
        <View style={styles.infoOverlay} pointerEvents="none">
          <Text style={styles.infoTitle}>{videoTitle}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.navy,
    paddingHorizontal: safe.horizontal,
    paddingVertical: safe.vertical,
    justifyContent: "center",
    gap: 24,
  },
  playingRoot: {
    flex: 1,
    backgroundColor: "#000",
  },
  player: {
    ...StyleSheet.absoluteFill,
  },
  slate: {
    flex: 1,
    backgroundColor: colors.navy,
    paddingHorizontal: safe.horizontal,
    paddingVertical: safe.vertical,
    justifyContent: "center",
    gap: 16,
  },
  title: { color: colors.offWhite, fontSize: 48, fontWeight: "700" },
  countdown: {
    color: colors.amber,
    fontSize: 72,
    fontWeight: "700",
    position: "absolute",
  },
  body: { color: colors.offWhite, fontSize: 26, maxWidth: 1100, lineHeight: 36 },
  warn: { color: colors.amber, fontSize: 24 },
  ringWrap: {
    width: 280,
    height: 280,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  ringTrack: {
    ...StyleSheet.absoluteFill,
    borderRadius: 140,
    borderWidth: 12,
    borderColor: colors.slate,
  },
  ringFill: {
    ...StyleSheet.absoluteFill,
    borderRadius: 140,
    borderWidth: 12,
  },
  pillWrap: {
    position: "absolute",
    top: safe.vertical,
    right: safe.horizontal,
    backgroundColor: colors.slate,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
  },
  pillAmber: {
    backgroundColor: colors.amber,
  },
  pillText: {
    color: colors.offWhite,
    fontSize: 28,
    fontWeight: "600",
  },
  infoOverlay: {
    position: "absolute",
    left: safe.horizontal,
    bottom: safe.vertical + 40,
    maxWidth: 900,
  },
  infoTitle: {
    color: colors.offWhite,
    fontSize: 32,
    fontWeight: "600",
    textShadowColor: "#000",
    textShadowRadius: 8,
  },
});
