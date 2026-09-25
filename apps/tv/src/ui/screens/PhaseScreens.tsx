import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Image,
  StyleSheet,
  Text,
  TVEventControl,
  useTVEventHandler,
  View,
  type LayoutChangeEvent,
  type AppStateStatus,
  type HWEvent,
} from "react-native";
import Animated, {
  interpolateColor,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { PRODUCT_NAME, type TimerSnapshot } from "@littleplay/core";
import { YoutubePlayerView } from "youtube-player";
import { QuietLink, TvButton } from "../components/TvButton";
import { BrandRow, ScreenHeader, ScreenShell } from "../components/ScreenChrome";
import { colors, useLayout } from "../../theme/tokens";
import {
  duration,
  EASE_IN_OUT,
  EASE_LINEAR,
  EASE_OUT,
  popScaleFrom,
} from "../../theme/motion";
import type { PlayerSessionApi } from "../../player/PlayerSession";
import {
  channelDeltaForTvEvent,
  formatChannelNumber,
  stepChannel,
  type PlaybackChannel,
} from "../../player/channels";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

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

/** 5…1 while the watch window is in its last five seconds, otherwise null. */
function endingCountdown(remainingMs: number): number | null {
  if (remainingMs <= 0 || remainingMs > 5_000) return null;
  return Math.ceil(remainingMs / 1000);
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
  resumeSeconds: number;
  onTuneChannel: (entryId: string) => void;
  onOpenSettings: () => void;
  settingsOpen: boolean;
  onHoldPosition: (seconds: number) => void;
};

/** How long the center channel digits stay up after a tune. */
const CEREMONY_MS = 1160;

const TUBE = {
  bezel: "#14110E",
  lip: "#0C0B0A",
  line: "#2A2622",
} as const;

/** How long the watch ring takes to settle on each 1s timer tick. */
const RING_TICK_MS = 400;

function requestTvFocus(node: unknown) {
  const target = node as { requestTVFocus?: () => void } | null;
  target?.requestTVFocus?.();
}

/** Rounded-rect outline inset into a width×height box, drawn clockwise from 12 o'clock. */
function rimPath(
  width: number,
  height: number,
  outerRadius: number,
  inset: number,
) {
  const left = inset;
  const top = inset;
  const right = width - inset;
  const bottom = height - inset;
  const r = Math.max(
    0,
    Math.min(outerRadius - inset, (right - left) / 2, (bottom - top) / 2),
  );
  const mid = width / 2;
  const d = [
    `M ${mid} ${top}`,
    `H ${right - r}`,
    `A ${r} ${r} 0 0 1 ${right} ${top + r}`,
    `V ${bottom - r}`,
    `A ${r} ${r} 0 0 1 ${right - r} ${bottom}`,
    `H ${left + r}`,
    `A ${r} ${r} 0 0 1 ${left} ${bottom - r}`,
    `V ${top + r}`,
    `A ${r} ${r} 0 0 1 ${left + r} ${top}`,
    `H ${mid}`,
  ].join(" ");
  const length =
    2 * (right - left - 2 * r) + 2 * (bottom - top - 2 * r) + 2 * Math.PI * r;
  return { d, length: Math.max(0, length) };
}

/**
 * Watch time left, lit along the bezel rim. Full when the window opens; the
 * lit end retreats counterclockwise to 12 o'clock as time runs out.
 */
function WatchTimeRing({
  fraction,
  warn,
  outerRadius,
  stroke,
  edge,
}: {
  fraction: number;
  /** 0→1 as the last minute starts; crossfades the strip to amber. */
  warn: SharedValue<number>;
  outerRadius: number;
  stroke: number;
  edge: number;
}) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(fraction);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox((prev) =>
      prev.width === width && prev.height === height
        ? prev
        : { width, height },
    );
  }, []);

  useEffect(() => {
    if (reduced) {
      progress.set(fraction);
      return;
    }
    // Settle each tick rather than sweep linearly: the SVG spans the whole
    // bezel, so it should sit idle over playing video most of each second.
    progress.set(
      withTiming(fraction, { duration: RING_TICK_MS, easing: EASE_IN_OUT }),
    );
  }, [fraction, progress, reduced]);

  const { d, length } = rimPath(
    box.width,
    box.height,
    outerRadius,
    edge + stroke / 2,
  );

  const litProps = useAnimatedProps(() => ({
    strokeDashoffset: length * (1 - progress.get()),
  }));
  const warnProps = useAnimatedProps(() => ({
    strokeDashoffset: length * (1 - progress.get()),
    opacity: warn.get(),
  }));

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={onLayout}
    >
      {box.width > 0 ? (
        <Svg width={box.width} height={box.height}>
          <Path d={d} stroke={TUBE.line} strokeWidth={stroke} fill="none" />
          <AnimatedPath
            d={d}
            stroke={colors.green}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${length} ${length}`}
            animatedProps={litProps}
          />
          <AnimatedPath
            d={d}
            stroke={colors.amber}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${length} ${length}`}
            animatedProps={warnProps}
          />
        </Svg>
      ) : null}
    </View>
  );
}

export function PlayingShell({
  snapshot,
  player,
  videoId,
  videoTitle,
  noPlayableSlate,
  showInfo,
  channels,
  channelEntryId,
  resumeSeconds,
  onTuneChannel,
  onOpenSettings,
  settingsOpen,
  onHoldPosition,
}: PlayingProps) {
  const { s } = useLayout();
  const last60 = snapshot.remainingMs <= 60_000;
  const watchFraction = Math.max(
    0,
    Math.min(1, snapshot.remainingMs / snapshot.policy.watchDurationMs),
  );
  const endCount = endingCountdown(snapshot.remainingMs);
  const [heldCount, setHeldCount] = useState<number | null>(endCount);
  const loadedRef = useRef<string | null>(null);
  const reduced = useReducedMotion();
  const amber = useSharedValue(last60 ? 1 : 0);
  const boot = useSharedValue(0);
  const allowMove = useSharedValue(reduced ? 0 : 1);
  const veil = useSharedValue(0);
  const osd = useSharedValue(0);
  const endShown = useSharedValue(0);
  const endPop = useSharedValue(1);
  const glassH = useSharedValue(0);
  const [ceremony, setCeremony] = useState(false);
  const [glassBox, setGlassBox] = useState({ width: 0, height: 0 });
  const onGlassLayout = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout;
    glassH.set(next.height);
    setGlassBox((prev) =>
      prev.width === next.width && prev.height === next.height
        ? prev
        : { width: next.width, height: next.height },
    );
  }, [glassH]);

  const settingsOpenRef = useRef(settingsOpen);
  settingsOpenRef.current = settingsOpen;

  useEffect(() => {
    if (!player.attached || !videoId) return;
    if (loadedRef.current === videoId) return;
    loadedRef.current = videoId;
    void (async () => {
      await player.loadVideo(videoId, resumeSeconds);
      if (settingsOpenRef.current) await player.pause();
    })();
  }, [player, player.attached, resumeSeconds, videoId]);

  const pausedForSettings = useRef(false);
  useEffect(() => {
    if (settingsOpen) {
      pausedForSettings.current = true;
      void (async () => {
        const seconds = await player.currentTime();
        onHoldPosition(seconds);
        await player.pause();
      })();
      return;
    }
    if (!pausedForSettings.current) return;
    pausedForSettings.current = false;
    void player.play();
  }, [onHoldPosition, player, settingsOpen]);

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

  const ledPlateStyle = useAnimatedStyle(() => ({
    opacity: amber.get(),
  }));
  const ledTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      amber.get(),
      [0, 1],
      [colors.amber, colors.navy],
    ),
  }));

  const channelsRef = useRef(channels);
  const activeRef = useRef(channelEntryId);
  const tuneRef = useRef(onTuneChannel);
  const openSettingsRef = useRef(onOpenSettings);
  const settingsFocused = useRef(false);
  const settingsLinkRef = useRef<View>(null);
  const sinkRef = useRef<View>(null);
  const lastStepAt = useRef(0);
  const ceremonyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTuned = useRef<string | null | undefined>(undefined);
  channelsRef.current = channels;
  activeRef.current = channelEntryId;
  tuneRef.current = onTuneChannel;
  openSettingsRef.current = onOpenSettings;

  useEffect(() => {
    TVEventControl.enableTVMenuKey();
    return () => TVEventControl.disableTVMenuKey();
  }, []);

  useEffect(() => {
    allowMove.set(reduced ? 0 : 1);
  }, [allowMove, reduced]);

  useEffect(() => {
    boot.set(
      withTiming(1, {
        duration: reduced ? 200 : 280,
        easing: EASE_OUT,
      }),
    );
  }, [boot, reduced]);

  useEffect(() => {
    return () => {
      if (ceremonyTimer.current) clearTimeout(ceremonyTimer.current);
    };
  }, []);

  useEffect(() => {
    if (lastTuned.current === undefined) {
      lastTuned.current = channelEntryId;
      return;
    }
    if (lastTuned.current === channelEntryId) return;
    lastTuned.current = channelEntryId;
    setCeremony(true);
    if (ceremonyTimer.current) clearTimeout(ceremonyTimer.current);
    ceremonyTimer.current = setTimeout(() => setCeremony(false), CEREMONY_MS);
    if (reduced) return;
    veil.set(
      withSequence(
        withTiming(0.36, { duration: 90, easing: EASE_OUT }),
        withTiming(0, { duration: 90, easing: EASE_OUT }),
      ),
    );
  }, [channelEntryId, reduced, veil]);

  if (endCount != null && heldCount !== endCount) setHeldCount(endCount);

  const wantOsd = (ceremony || showInfo) && endCount == null;
  useEffect(() => {
    osd.set(
      withTiming(wantOsd ? 1 : 0, {
        duration: reduced ? 200 : wantOsd ? duration.fast : duration.press,
        easing: EASE_OUT,
      }),
    );
  }, [osd, reduced, wantOsd]);

  useEffect(() => {
    endShown.set(
      withTiming(endCount == null ? 0 : 1, {
        duration: reduced ? 200 : duration.fast,
        easing: EASE_OUT,
      }),
    );
  }, [endCount, endShown, reduced]);

  useEffect(() => {
    if (endCount == null) return;
    if (reduced) {
      endPop.set(1);
      return;
    }
    endPop.set(
      withSequence(
        withTiming(popScaleFrom, { duration: 0 }),
        withTiming(1, { duration: duration.fast, easing: EASE_OUT }),
      ),
    );
  }, [endCount, endPop, reduced]);

  const shutterTopStyle = useAnimatedStyle(() => {
    const shown = boot.get();
    const distance = glassH.get() / 2;
    if (allowMove.get() === 0 || distance <= 0) {
      return { opacity: 0, transform: [{ translateY: 0 }] };
    }
    return {
      opacity: 1,
      transform: [{ translateY: -shown * distance }],
    };
  });
  const shutterBottomStyle = useAnimatedStyle(() => {
    const shown = boot.get();
    const distance = glassH.get() / 2;
    if (allowMove.get() === 0 || distance <= 0) {
      return { opacity: 0, transform: [{ translateY: 0 }] };
    }
    return {
      opacity: 1,
      transform: [{ translateY: shown * distance }],
    };
  });
  const reducedCoverStyle = useAnimatedStyle(() => ({
    opacity: allowMove.get() === 0 ? 1 - boot.get() : 0,
  }));
  const slitStyle = useAnimatedStyle(() => ({
    opacity: allowMove.get() === 0 ? 0 : 1 - boot.get(),
  }));
  const glassFxStyle = useAnimatedStyle(() => ({
    opacity: boot.get(),
  }));
  const veilStyle = useAnimatedStyle(() => ({
    opacity: veil.get(),
  }));
  const osdStyle = useAnimatedStyle(() => {
    const shown = osd.get();
    const scale = allowMove.get() === 0 ? 1 : 0.96 + shown * 0.04;
    return {
      opacity: shown,
      transform: [{ scale }],
    };
  });
  const endWrapStyle = useAnimatedStyle(() => ({
    opacity: endShown.get(),
  }));
  const endDigitStyle = useAnimatedStyle(() => ({
    transform: [{ scale: allowMove.get() === 0 ? 1 : endPop.get() }],
  }));

  const onTvEvent = useCallback((event: HWEvent) => {
    if (settingsOpenRef.current) return;
    if (event.eventKeyAction != null && event.eventKeyAction !== 1) return;
    if (event.eventType === "menu") {
      openSettingsRef.current();
      return;
    }
    if (event.eventType === "down" && !settingsFocused.current) {
      requestTvFocus(settingsLinkRef.current);
      return;
    }
    if (event.eventType === "up" && settingsFocused.current) {
      requestTvFocus(sinkRef.current);
      return;
    }
    if (settingsFocused.current) return;
    const delta = channelDeltaForTvEvent(event);
    if (delta === 0) return;
    const now = Date.now();
    if (now - lastStepAt.current < 350) return;
    lastStepAt.current = now;
    const list = channelsRef.current;
    if (list.length < 2) return;
    const next = stepChannel(list, activeRef.current, delta);
    if (!next || next.entryId === activeRef.current) return;
    // Apply before the next render so a quick opposite press does not
    // step from the channel we just left.
    activeRef.current = next.entryId;
    tuneRef.current(next.entryId);
  }, []);
  useTVEventHandler(onTvEvent);

  const activeChannel =
    channels.find((channel) => channel.entryId === channelEntryId) ?? null;
  const readoutTitle = activeChannel?.title ?? videoTitle;
  const glassRadius = s(14);
  const bezelRadius = s(28);
  // The band under the chin is the bezel's thinnest; the strip fits inside it.
  const rim = s(12);
  const channelLabel = activeChannel
    ? formatChannelNumber(activeChannel.number)
    : null;

  return (
    <View
      style={styles.playingRoot}
      accessibilityLabel="Playing"
      {...({
        trapFocusLeft: !settingsOpen,
        trapFocusRight: !settingsOpen,
        trapFocusUp: !settingsOpen,
        trapFocusDown: !settingsOpen,
      } as object)}
    >
      {/*
        The player blocks focus so the WebView cannot seek. With nothing
        focused, Android never delivers D-pad keys. This sink holds focus
        without drawing a highlight over the video.
      */}
      <View
        ref={sinkRef}
        style={styles.keySink}
        focusable={!settingsOpen}
        accessible={false}
        importantForAccessibility="no"
        {...({ hasTVPreferredFocus: !settingsOpen } as object)}
      />
      <View
        style={[
          styles.bezel,
          {
            borderRadius: bezelRadius,
            paddingHorizontal: s(18),
            paddingTop: s(18),
            paddingBottom: rim,
            gap: s(12),
          },
        ]}
      >
        <WatchTimeRing
          fraction={watchFraction}
          warn={amber}
          outerRadius={bezelRadius - styles.bezel.borderWidth}
          stroke={Math.max(3, Math.round(rim * 0.4))}
          edge={Math.max(2, Math.round(rim * 0.3))}
        />
        <View
          style={[
            styles.lip,
            { borderRadius: s(18), padding: s(6) },
          ]}
        >
          <View
            style={[styles.glass, { borderRadius: glassRadius }]}
            onLayout={onGlassLayout}
          >
            <View style={StyleSheet.absoluteFill}>
              {player.attached && !noPlayableSlate ? (
                <YoutubePlayerView
                  ref={player.nativeRef}
                  style={[styles.player, { borderRadius: glassRadius }]}
                  onPlayerEvent={player.onNativeEvent}
                />
              ) : noPlayableSlate ? (
                <View style={[styles.slate, { paddingHorizontal: s(36) }]}>
                  <Text style={[styles.slateTitle, { fontSize: s(36) }]}>
                    {channels.length > 1
                      ? "Nothing playable on this channel"
                      : "Nothing playable left"}
                  </Text>
                  <Text
                    style={[
                      styles.slateBody,
                      { fontSize: s(22), marginTop: s(12) },
                    ]}
                  >
                    {channels.length > 1
                      ? "This watch window keeps counting down. Left or right changes the channel."
                      : "This watch window keeps counting down. Rest starts when time runs out."}
                  </Text>
                </View>
              ) : null}
            </View>
            <Animated.View
              pointerEvents="none"
              style={[styles.shutter, styles.shutterTop, shutterTopStyle]}
            />
            <Animated.View
              pointerEvents="none"
              style={[styles.shutter, styles.shutterBottom, shutterBottomStyle]}
            />
            <Animated.View
              pointerEvents="none"
              style={[styles.reducedCover, reducedCoverStyle]}
            />
            <Animated.View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, glassFxStyle]}
            >
              {glassBox.width > 0 ? (
              <Svg
                width={glassBox.width}
                height={glassBox.height}
                pointerEvents="none"
              >
                <Defs>
                  <RadialGradient
                    id="tubeVig"
                    cx="50%"
                    cy="50%"
                    rx="68%"
                    ry="68%"
                  >
                    <Stop offset="0.52" stopColor="#000" stopOpacity={0} />
                    <Stop offset="1" stopColor="#000" stopOpacity={0.55} />
                  </RadialGradient>
                  <RadialGradient
                    id="tubeGlint"
                    cx="24%"
                    cy="16%"
                    rx="46%"
                    ry="46%"
                  >
                    <Stop offset="0" stopColor="#fff" stopOpacity={0.16} />
                    <Stop offset="1" stopColor="#fff" stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Rect width="100%" height="100%" fill="url(#tubeVig)" />
                <Rect width="100%" height="100%" fill="url(#tubeGlint)" />
              </Svg>
              ) : null}
            </Animated.View>
            <Animated.View
              pointerEvents="none"
              style={[styles.veil, veilStyle]}
            />
            <Animated.View
              pointerEvents="none"
              style={[styles.slitGlow, slitStyle]}
            />
            <Animated.View
              pointerEvents="none"
              style={[styles.slit, slitStyle]}
            />
            <Animated.View
              pointerEvents="none"
              style={[styles.osd, osdStyle]}
              accessible={false}
            >
              <Svg
                width="100%"
                height="100%"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                style={StyleSheet.absoluteFill}
              >
                <Ellipse
                  cx={50}
                  cy={46}
                  rx={34}
                  ry={28}
                  fill="#06080c"
                  fillOpacity={0.55}
                />
              </Svg>
              {channelLabel ? (
                <Text style={[styles.osdNum, { fontSize: s(88) }]}>
                  {channelLabel}
                </Text>
              ) : null}
              {readoutTitle ? (
                <Text
                  style={[styles.osdTitle, { fontSize: s(28) }]}
                  numberOfLines={2}
                >
                  {readoutTitle}
                </Text>
              ) : null}
            </Animated.View>
            {heldCount != null ? (
              <Animated.View
                pointerEvents="none"
                accessible={endCount != null}
                accessibilityLabel={
                  endCount != null ? `${endCount} seconds left` : undefined
                }
                style={[styles.endCount, endWrapStyle]}
              >
                <Svg
                  width="100%"
                  height="100%"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  style={StyleSheet.absoluteFill}
                >
                  <Ellipse
                    cx={50}
                    cy={50}
                    rx={28}
                    ry={32}
                    fill="#06080c"
                    fillOpacity={0.62}
                  />
                </Svg>
                <Animated.Text
                  style={[
                    styles.endDigit,
                    { fontSize: s(220) },
                    endDigitStyle,
                  ]}
                >
                  {heldCount}
                </Animated.Text>
              </Animated.View>
            ) : null}
          </View>
        </View>
        <View style={[styles.chin, { minHeight: s(56) }]}>
          <View style={[styles.chRead, { gap: s(8) }]}>
            {channelLabel ? (
              <>
                <Text style={[styles.chK, { fontSize: s(14) }]}>CH</Text>
                <Text style={[styles.chN, { fontSize: s(32) }]}>
                  {channelLabel}
                </Text>
              </>
            ) : null}
          </View>
          {settingsOpen ? (
            <View pointerEvents="none" style={styles.markWrap}>
              <Text style={[styles.mark, { fontSize: s(13) }]}>
                {PRODUCT_NAME.toUpperCase()}
              </Text>
            </View>
          ) : (
            <QuietLink
              ref={settingsLinkRef}
              label="Parent settings"
              onPress={onOpenSettings}
              onFocus={() => {
                settingsFocused.current = true;
              }}
              onBlur={() => {
                settingsFocused.current = false;
              }}
            />
          )}
          <View style={styles.led}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ledPlate,
                { borderRadius: s(10) },
                ledPlateStyle,
              ]}
            />
            <Animated.Text
              style={[styles.ledNum, { fontSize: s(26) }, ledTextStyle]}
            >
              {formatRemaining(snapshot.remainingMs)}
            </Animated.Text>
            <Animated.Text
              style={[styles.ledCap, { fontSize: s(11) }, ledTextStyle]}
            >
              LEFT
            </Animated.Text>
          </View>
        </View>
      </View>
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
  playingRoot: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  keySink: { position: "absolute", width: 1, height: 1, opacity: 0 },
  bezel: {
    width: "86%",
    backgroundColor: TUBE.bezel,
    borderWidth: 1,
    borderColor: TUBE.line,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
  },
  lip: {
    width: "100%",
    backgroundColor: TUBE.lip,
    borderWidth: 1,
    borderColor: TUBE.line,
  },
  glass: {
    width: "100%",
    aspectRatio: 16 / 9,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  player: { ...StyleSheet.absoluteFill },
  slate: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  slateTitle: {
    color: colors.offWhite,
    fontWeight: "700",
    textAlign: "center",
  },
  slateBody: { color: colors.offWhite, textAlign: "center" },
  shutter: {
    position: "absolute",
    left: 0,
    right: 0,
    height: "50%",
    backgroundColor: "#000",
    zIndex: 2,
  },
  shutterTop: { top: 0 },
  shutterBottom: { bottom: 0 },
  reducedCover: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#000",
    zIndex: 2,
  },
  veil: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#000",
    zIndex: 3,
  },
  slitGlow: {
    position: "absolute",
    left: "8%",
    right: "8%",
    top: "50%",
    height: 8,
    marginTop: -4,
    backgroundColor: "rgba(248, 198, 93, 0.35)",
    zIndex: 4,
  },
  slit: {
    position: "absolute",
    left: "10%",
    right: "10%",
    top: "50%",
    height: 2,
    marginTop: -1,
    backgroundColor: colors.amber,
    zIndex: 5,
  },
  osd: {
    ...StyleSheet.absoluteFill,
    zIndex: 6,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  osdNum: {
    color: colors.amber,
    fontFamily: "monospace",
    fontWeight: "700",
    letterSpacing: 2,
    textShadowColor: "rgba(0, 0, 0, 0.65)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 12,
  },
  osdTitle: {
    maxWidth: "70%",
    color: colors.offWhite,
    fontWeight: "600",
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.65)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  endCount: {
    ...StyleSheet.absoluteFill,
    zIndex: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  endDigit: {
    color: colors.amber,
    fontFamily: "monospace",
    fontWeight: "700",
    textShadowColor: "rgba(0, 0, 0, 0.7)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 18,
  },
  chin: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chRead: { flexDirection: "row", alignItems: "baseline", minWidth: 72 },
  chK: {
    color: colors.amber,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  chN: {
    color: colors.offWhite,
    fontFamily: "monospace",
    fontWeight: "700",
  },
  markWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: {
    color: "rgba(245, 242, 234, 0.38)",
    fontWeight: "600",
    letterSpacing: 3,
  },
  led: { alignItems: "flex-end", justifyContent: "center" },
  ledPlate: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.amber,
  },
  ledNum: {
    color: colors.amber,
    fontFamily: "monospace",
    fontWeight: "700",
    letterSpacing: 1,
    zIndex: 1,
  },
  ledCap: {
    color: colors.amber,
    fontWeight: "700",
    letterSpacing: 1.5,
    zIndex: 1,
  },
});
