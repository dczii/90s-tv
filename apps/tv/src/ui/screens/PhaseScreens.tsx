import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Image,
  StyleSheet,
  Text,
  useTVEventHandler,
  View,
  type AppStateStatus,
  type HWEvent,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeOutDown,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import type { TimerSnapshot } from "@littleplay/core";
import { YoutubePlayerView } from "youtube-player";
import { QuietLink, TvButton } from "../components/TvButton";
import { BrandRow, ScreenHeader, ScreenShell } from "../components/ScreenChrome";
import { colors, useLayout } from "../../theme/tokens";
import {
  duration,
  EASE_LINEAR,
  EASE_OUT,
} from "../../theme/motion";
import type { PlayerSessionApi } from "../../player/PlayerSession";
import {
  formatChannelNumber,
  stepChannel,
  type PlaybackChannel,
} from "../../player/channels";
import { ChannelStrip } from "../components/ChannelStrip";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type ReadyProps = {
  snapshot: TimerSnapshot;
  onContinue: () => void;
  onOpenSettings: () => void;
  allowlistEmpty?: boolean;
  continueBusy?: boolean;
  noPlayable?: boolean;
  continueError?: string | null;
  nextTitle?: string | null;
  nextThumbnailUrl?: string | null;
};

function posterUrl(url: string): string {
  return url.replace("/hqdefault.jpg", "/mqdefault.jpg");
}

function minutesLabel(n: number): string {
  return `${n} minute${n === 1 ? "" : "s"}`;
}

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
  nextTitle = null,
  nextThumbnailUrl = null,
}: ReadyProps) {
  const { s } = useLayout();
  const watchMin = Math.round(snapshot.policy.watchDurationMs / 60_000);
  const disabled = allowlistEmpty || noPlayable || continueBusy;

  return (
    <ScreenShell accessibilityLabel="Continue watching" atmosphere="ready">
      <BrandRow />
      <View style={[styles.readyBody, { gap: s(40) }]}>
        <View style={[styles.readyCopy, { gap: s(20) }]}>
          <Text
            style={[styles.readyTitle, { fontSize: s(64), lineHeight: s(74) }]}
          >
            Ready when you are.
          </Text>
          <Text style={[styles.readySub, { fontSize: s(26), lineHeight: s(34) }]}>
            Your timer starts only after you continue.
            {allowlistEmpty
              ? " Add playlists in Parent settings before continuing."
              : ""}
            {noPlayable
              ? " None of the allowed items can play right now."
              : ""}
          </Text>
          <View
            style={[
              styles.availCard,
              {
                borderRadius: s(26),
                paddingVertical: s(24),
                paddingHorizontal: s(28),
                gap: s(16),
              },
            ]}
          >
            <Text style={[styles.availIcon, { fontSize: s(40) }]}>⏱</Text>
            <View>
              <Text style={[styles.availTime, { fontSize: s(40) }]}>
                {minutesLabel(watchMin)}
              </Text>
              <Text style={[styles.availLabel, { fontSize: s(20) }]}>
                available to watch
              </Text>
            </View>
          </View>
          {continueError ? (
            <Text style={[styles.warn, { fontSize: s(22) }]}>{continueError}</Text>
          ) : null}
          <TvButton
            label={continueBusy ? "Checking…" : "Continue watching"}
            disabled={disabled}
            onPress={onContinue}
            {...({ hasTVPreferredFocus: true } as object)}
          />
          <QuietLink label="Parent settings" onPress={onOpenSettings} />
        </View>
        <View
          style={[
            styles.nextCard,
            {
              borderRadius: s(42),
              padding: s(32),
              gap: s(14),
            },
          ]}
        >
          <View
            style={[
              styles.nextArt,
              { borderRadius: s(26), minHeight: s(220) },
            ]}
          >
            {nextThumbnailUrl ? (
              <Image
                source={{ uri: posterUrl(nextThumbnailUrl) }}
                style={styles.nextThumb}
                resizeMode="cover"
              />
            ) : (
              <Text style={{ fontSize: s(64), color: colors.offWhite }}>▶</Text>
            )}
          </View>
          <Text style={[styles.nextTitle, { fontSize: s(32) }]} numberOfLines={2}>
            {nextTitle ?? "Your playlists"}
          </Text>
          <Text style={[styles.nextSub, { fontSize: s(20) }]}>
            Up next from your allowed playlists
          </Text>
        </View>
      </View>
    </ScreenShell>
  );
}

function RestProgressRing({
  size,
  stroke,
  fraction,
}: {
  size: number;
  stroke: number;
  fraction: number;
}) {
  const reduced = useReducedMotion();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(fraction);

  useEffect(() => {
    if (reduced) {
      progress.set(fraction);
      return;
    }
    progress.set(
      withTiming(fraction, { duration: 900, easing: EASE_LINEAR }),
    );
  }, [fraction, progress, reduced]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.get()),
  }));

  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={colors.panel2}
        strokeWidth={stroke}
        fill="none"
      />
      <AnimatedCircle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={colors.green}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        animatedProps={animatedProps}
        strokeLinecap="round"
        rotation="-90"
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
}

export function RestScreen({
  snapshot,
  onOpenSettings,
}: {
  snapshot: TimerSnapshot;
  onOpenSettings: () => void;
}) {
  const { s } = useLayout();
  const fraction = Math.max(
    0,
    Math.min(1, snapshot.remainingMs / snapshot.policy.restDurationMs),
  );
  const ring = Math.min(s(360), 240);
  const stroke = s(14);

  return (
    <ScreenShell accessibilityLabel="Rest timer">
      <ScreenHeader
        section="Rest window"
        title="Time for a break"
        subtitle="The player is off. Step away, stretch, or find something fun to do."
      />
      <View style={[styles.restCenter, { gap: s(14) }]}>
        <View style={[styles.ringWrap, { width: ring, height: ring }]}>
          <RestProgressRing size={ring} stroke={stroke} fraction={fraction} />
          <Text style={[styles.countdown, { fontSize: s(64) }]}>
            {formatRemaining(snapshot.remainingMs)}
          </Text>
          <Text style={[styles.breakLabel, { fontSize: s(16) }]}>
            BREAK REMAINING
          </Text>
        </View>
        <Text style={[styles.restNote, { fontSize: s(22) }]}>
          Nothing will play until the break ends.
        </Text>
        <Text style={[styles.restNoteMuted, { fontSize: s(18) }]}>
          When it reaches zero, you’ll still choose when to continue.
        </Text>
      </View>
      <View style={styles.restFooter}>
        <QuietLink
          label="Parent settings"
          onPress={onOpenSettings}
          preferredFocus
        />
      </View>
    </ScreenShell>
  );
}

type PlayingProps = {
  snapshot: TimerSnapshot;
  player: PlayerSessionApi;
  videoId: string | null;
  videoTitle: string | null;
  noPlayableSlate: boolean;
  showInfo: boolean;
  channels: readonly PlaybackChannel[];
  channelEntryId: string | null;
  onTuneChannel: (entryId: string) => void;
};

const CHANNEL_OSD_MS = 4000;

export function PlayingShell({
  snapshot,
  player,
  videoId,
  videoTitle,
  noPlayableSlate,
  showInfo,
  channels,
  channelEntryId,
  onTuneChannel,
}: PlayingProps) {
  const { s, safeX, safeY } = useLayout();
  const last60 = snapshot.remainingMs <= 60_000;
  const loadedRef = useRef<string | null>(null);
  const reduced = useReducedMotion();
  const amber = useSharedValue(last60 ? 1 : 0);

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

  useEffect(() => {
    if (reduced) {
      amber.set(last60 ? 1 : 0);
      return;
    }
    amber.set(
      withTiming(last60 ? 1 : 0, {
        duration: duration.screen,
        easing: EASE_OUT,
      }),
    );
  }, [amber, last60, reduced]);

  const amberStyle = useAnimatedStyle(() => ({
    opacity: amber.get(),
  }));

  const [channelOsd, setChannelOsd] = useState(true);
  const channelsRef = useRef(channels);
  const activeRef = useRef(channelEntryId);
  const tuneRef = useRef(onTuneChannel);
  const lastStepAt = useRef(0);
  const osdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  channelsRef.current = channels;
  activeRef.current = channelEntryId;
  tuneRef.current = onTuneChannel;

  const revealChannels = useCallback(() => {
    setChannelOsd(true);
    if (osdTimer.current) clearTimeout(osdTimer.current);
    osdTimer.current = setTimeout(() => setChannelOsd(false), CHANNEL_OSD_MS);
  }, []);

  useEffect(() => {
    revealChannels();
    return () => {
      if (osdTimer.current) clearTimeout(osdTimer.current);
    };
  }, [channelEntryId, noPlayableSlate, revealChannels]);

  const onTvEvent = useCallback((event: HWEvent) => {
    if (event.eventKeyAction != null && event.eventKeyAction !== 0) return;
    const delta =
      event.eventType === "right" || event.eventType === "channelUp"
        ? 1
        : event.eventType === "left" || event.eventType === "channelDown"
          ? -1
          : 0;
    if (delta === 0) return;
    revealChannels();
    const now = Date.now();
    if (now - lastStepAt.current < 350) return;
    lastStepAt.current = now;
    const list = channelsRef.current;
    if (list.length < 2) return;
    const next = stepChannel(list, activeRef.current, delta);
    if (!next || next.entryId === activeRef.current) return;
    tuneRef.current(next.entryId);
  }, [revealChannels]);
  useTVEventHandler(onTvEvent);

  const activeChannel =
    channels.find((channel) => channel.entryId === channelEntryId) ?? null;

  return (
    <View style={styles.playingRoot} accessibilityLabel="Playing">
      {player.attached && !noPlayableSlate ? (
        <YoutubePlayerView
          ref={player.nativeRef}
          style={styles.player}
          onPlayerEvent={player.onNativeEvent}
        />
      ) : noPlayableSlate ? (
        <ScreenShell>
          <Text style={[styles.slateTitle, { fontSize: s(42) }]}>
            {channels.length > 1
              ? "Nothing playable on this channel"
              : "Nothing playable left"}
          </Text>
          <Text
            style={[
              styles.slateBody,
              { fontSize: s(24), marginTop: s(12) },
            ]}
          >
            {channels.length > 1
              ? "This watch window keeps counting down. Left or right changes the channel."
              : "This watch window keeps counting down. Rest starts when time runs out."}
          </Text>
        </ScreenShell>
      ) : (
        <View style={styles.playingRoot} />
      )}
      <View
        style={[
          styles.pillWrap,
          {
            top: safeY,
            right: safeX,
            borderRadius: s(34),
            paddingHorizontal: s(18),
            paddingVertical: s(12),
          },
        ]}
        pointerEvents="none"
        {...({ focusable: false } as object)}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.pillAmberFill,
            { borderRadius: s(34) },
            amberStyle,
          ]}
        />
        <Text style={[styles.pillText, { fontSize: s(22), zIndex: 1 }]}>
          {formatRemaining(snapshot.remainingMs)} left
        </Text>
      </View>
      {activeChannel ? (
        <View
          style={[
            styles.channelBadge,
            {
              top: safeY,
              left: safeX,
              borderRadius: s(34),
              paddingHorizontal: s(24),
              height: s(68),
              gap: s(10),
            },
          ]}
          pointerEvents="none"
          {...({ focusable: false } as object)}
        >
          <Text style={[styles.channelLabel, { fontSize: s(16) }]}>CH</Text>
          <Text style={[styles.channelDigits, { fontSize: s(32) }]}>
            {formatChannelNumber(activeChannel.number)}
          </Text>
        </View>
      ) : null}
      {showInfo && videoTitle ? (
        <Animated.View
          entering={
            reduced
              ? undefined
              : FadeInDown.duration(duration.fast).easing(EASE_OUT)
          }
          exiting={
            reduced
              ? undefined
              : FadeOutDown.duration(duration.press).easing(EASE_OUT)
          }
          style={[
            styles.infoOverlay,
            {
              left: safeX,
              bottom: safeY,
              borderRadius: s(24),
              padding: s(24),
              gap: s(8),
              maxWidth: "50%",
            },
          ]}
          pointerEvents="none"
        >
          <Text style={[styles.infoEyebrow, { fontSize: s(16) }]}>NOW PLAYING</Text>
          <Text style={[styles.infoTitle, { fontSize: s(32) }]}>{videoTitle}</Text>
        </Animated.View>
      ) : null}
      <ChannelStrip
        channels={channels}
        activeEntryId={channelEntryId}
        visible={channelOsd}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  readyBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 0,
  },
  readyCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  readyTitle: { color: colors.offWhite, fontWeight: "700" },
  readySub: { color: colors.muted, maxWidth: "95%" },
  availCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.scrim,
    borderWidth: 1,
    borderColor: colors.white10,
    alignSelf: "flex-start",
  },
  availIcon: { color: colors.amber },
  availTime: { color: colors.offWhite, fontWeight: "700" },
  availLabel: { color: colors.muted, fontWeight: "500" },
  warn: { color: colors.amber },
  nextCard: {
    flex: 0.9,
    backgroundColor: colors.panelScrim,
    borderWidth: 1,
    borderColor: colors.white10,
    alignSelf: "stretch",
    maxHeight: "80%",
    minWidth: 0,
    justifyContent: "center",
  },
  nextArt: {
    alignSelf: "stretch",
    flex: 1,
    backgroundColor: "#2A4059",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 0,
    overflow: "hidden",
  },
  nextThumb: {
    width: "100%",
    height: "100%",
  },
  nextTitle: { color: colors.offWhite, fontWeight: "700" },
  nextSub: { color: colors.muted },
  restCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 0,
  },
  ringWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  countdown: {
    color: colors.offWhite,
    fontWeight: "700",
  },
  breakLabel: {
    color: colors.green,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 4,
  },
  restNote: { color: colors.muted, textAlign: "center", maxWidth: "70%" },
  restNoteMuted: {
    color: colors.muted,
    textAlign: "center",
    maxWidth: "75%",
    opacity: 0.85,
  },
  restFooter: { flexShrink: 0 },
  playingRoot: { flex: 1, backgroundColor: "#000" },
  player: { ...StyleSheet.absoluteFill },
  slateTitle: { color: colors.offWhite, fontWeight: "700" },
  slateBody: { color: colors.offWhite },
  pillWrap: {
    position: "absolute",
    backgroundColor: "rgba(10,16,28,0.87)",
    borderWidth: 1,
    borderColor: colors.white20,
    overflow: "hidden",
  },
  pillAmberFill: {
    backgroundColor: colors.amber,
  },
  pillText: { color: colors.offWhite, fontWeight: "700" },
  channelBadge: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(10,16,28,0.87)",
    borderWidth: 1,
    borderColor: colors.white20,
  },
  channelLabel: {
    color: colors.amber,
    fontWeight: "700",
    letterSpacing: 1,
  },
  channelDigits: { color: colors.offWhite, fontWeight: "700" },
  infoOverlay: {
    position: "absolute",
    backgroundColor: "rgba(10,16,28,0.87)",
  },
  infoEyebrow: {
    color: colors.amber,
    fontWeight: "700",
    letterSpacing: 1,
  },
  infoTitle: { color: colors.offWhite, fontWeight: "700" },
});
