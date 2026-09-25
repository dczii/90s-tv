import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { BackHandler, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, useReducedMotion } from "react-native-reanimated";
import { moveTaskToBack } from "youtube-player";
import { useAppSession } from "./app/session";
import { usePlayerSession } from "./player/PlayerSession";
import { usePlaybackController } from "./player/usePlaybackController";
import { WelcomeScreen } from "./ui/screens/WelcomeScreen";
import { TimerSetupScreen } from "./ui/screens/TimerSetupScreen";
import {
  PlayingShell,
  ReadyScreen,
  RestScreen,
} from "./ui/screens/PhaseScreens";
import { ParentSettingsScreen } from "./ui/screens/ParentSettingsScreen";
import { CuratedPlaylistsScreen } from "./ui/screens/CuratedPlaylistsScreen";
import { ChooseContentScreen } from "./ui/screens/ChooseContentScreen";
import { colors } from "./theme/tokens";
import { duration, EASE_OUT } from "./theme/motion";
import { ScreenShell } from "./ui/components/ScreenChrome";
import { ScreenFade } from "./ui/motion/ScreenFade";

export default function RootApp() {
  const reducedMotion = useReducedMotion();
  const session = useAppSession();
  const player = usePlayerSession();
  const playback = usePlaybackController({
    phase: session.snapshot?.phase,
    kv: session.kv,
    entries: session.allowlistEntries,
    player,
    confirmWatching: session.confirmWatching,
  });

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (session.contentRoute) {
        session.closeContent();
        return true;
      }
      if (session.showSettings) {
        session.closeSettings();
        return true;
      }
      if (session.snapshot?.phase === "Playing") {
        moveTaskToBack();
        return true;
      }
      if (
        session.snapshot?.phase === "Resting" ||
        session.snapshot?.phase === "AwaitingConfirmation"
      ) {
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [
    session.showSettings,
    session.contentRoute,
    session.snapshot?.phase,
    session.closeSettings,
    session.closeContent,
  ]);

  if (session.bootError) {
    return (
      <ScreenShell>
        <StatusBar hidden />
        <Text style={styles.error}>Storage unavailable</Text>
        <Text style={styles.body}>{session.bootError}</Text>
      </ScreenShell>
    );
  }

  if (!session.snapshot) {
    return (
      <ScreenShell>
        <StatusBar hidden />
        <Text style={styles.body}>Starting…</Text>
      </ScreenShell>
    );
  }

  const showCuratedIntro = session.wizardStep === "curated";
  const showChoose =
    session.wizardStep === "choose" || session.contentRoute === "choose";

  let screenKey = "boot";
  let screen = (
    <ScreenShell>
      <Text style={styles.body}>Unexpected phase</Text>
    </ScreenShell>
  );

  if (showCuratedIntro) {
    screenKey = "wizard-curated";
    screen = <CuratedPlaylistsScreen onContinue={session.goWizardChoose} />;
  } else if (showChoose && session.allowlistRepo) {
    screenKey =
      session.contentRoute === "choose" ? "content-choose" : "wizard-choose";
    screen = (
      <ChooseContentScreen
        allowlist={session.allowlistRepo}
        mode={session.contentRoute === "choose" ? "manage" : "wizard"}
        onSaved={
          session.contentRoute === "choose"
            ? session.onPlaylistsUpdated
            : session.onAllowlistSaved
        }
        onBack={
          session.contentRoute === "choose"
            ? session.closeContent
            : session.goWizardCurated
        }
      />
    );
  } else if (session.showSettings && session.snapshot.phase !== "Playing") {
    screenKey = "settings";
    screen = (
      <ParentSettingsScreen
        snapshot={session.snapshot}
        allowlistCount={session.allowlistEntries.length}
        onChangePolicy={session.changePolicy}
        onResetCycle={session.resetCycle}
        onManageContent={() => session.openChoose()}
        onClose={session.closeSettings}
      />
    );
  } else if (session.wizardStep === "welcome") {
    screenKey = "wizard-welcome";
    screen = <WelcomeScreen onStart={session.startSetup} />;
  } else if (session.wizardStep === "timerSetup") {
    screenKey = "wizard-timer";
    screen = (
      <TimerSetupScreen onSave={session.completeSetup} />
    );
  } else if (session.snapshot.phase === "AwaitingConfirmation") {
    screenKey = "phase-ready";
    screen = (
      <ReadyScreen
        snapshot={session.snapshot}
        allowlistEmpty={session.allowlistEntries.length === 0}
        continueBusy={playback.ui.continueBusy}
        noPlayable={playback.ui.noPlayableOnConfirm}
        continueError={playback.ui.continueError}
        nextTitle={session.allowlistEntries[0]?.title ?? null}
        nextThumbnailUrl={session.allowlistEntries[0]?.thumbnailUrl ?? null}
        onContinue={() => {
          void playback.continueWatching();
        }}
        onOpenSettings={session.openSettings}
      />
    );
  } else if (session.snapshot.phase === "Resting") {
    screenKey = "phase-rest";
    screen = (
      <RestScreen
        snapshot={session.snapshot}
        onOpenSettings={session.openSettings}
      />
    );
  } else if (session.snapshot.phase === "Playing") {
    screenKey = "phase-playing";
    screen = (
      <View style={styles.playingStage}>
        <PlayingShell
          snapshot={session.snapshot}
          player={player}
          videoId={playback.ui.videoId}
          videoTitle={playback.ui.videoTitle}
          noPlayableSlate={playback.ui.noPlayableSlate}
          showInfo={playback.ui.showInfo}
          channels={playback.ui.channels}
          channelEntryId={playback.ui.channelEntryId}
          resumeSeconds={playback.ui.resumeSeconds}
          onTuneChannel={(entryId) => {
            void playback.tuneChannel(entryId);
          }}
          onOpenSettings={session.openSettings}
          settingsOpen={session.showSettings}
          onHoldPosition={playback.holdPosition}
        />
        {session.showSettings ? (
          <Animated.View
            entering={
              reducedMotion
                ? undefined
                : FadeIn.duration(duration.screen).easing(EASE_OUT)
            }
            exiting={
              reducedMotion
                ? undefined
                : FadeOut.duration(duration.fast).easing(EASE_OUT)
            }
            style={styles.settingsCover}
          >
            <ParentSettingsScreen
              snapshot={session.snapshot}
              allowlistCount={session.allowlistEntries.length}
              onChangePolicy={session.changePolicy}
              onResetCycle={session.resetCycle}
              onManageContent={() => session.openChoose()}
              onClose={session.closeSettings}
            />
          </Animated.View>
        ) : null}
      </View>
    );
  }

  return (
    <>
      <StatusBar hidden />
      <ScreenFade screenKey={screenKey}>{screen}</ScreenFade>
    </>
  );
}

const styles = StyleSheet.create({
  playingStage: { flex: 1 },
  settingsCover: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  body: { color: colors.offWhite, fontSize: 28 },
  error: {
    color: colors.amber,
    fontSize: 36,
    fontWeight: "700",
    marginBottom: 16,
  },
});
