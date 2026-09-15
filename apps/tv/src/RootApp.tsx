import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { BackHandler, StyleSheet, Text, View } from "react-native";
import { useAppSession } from "./app/session";
import { WelcomeScreen } from "./ui/screens/WelcomeScreen";
import { TimerSetupScreen } from "./ui/screens/TimerSetupScreen";
import {
  PlayingShell,
  ReadyScreen,
  RestScreen,
} from "./ui/screens/PhaseScreens";
import { ParentSettingsScreen } from "./ui/screens/ParentSettingsScreen";
import { ConnectYouTubeScreen } from "./ui/screens/ConnectYouTubeScreen";
import { ChooseContentScreen } from "./ui/screens/ChooseContentScreen";
import { colors, safe } from "./theme/tokens";

export default function RootApp() {
  const session = useAppSession();

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
      <View style={styles.shell}>
        <StatusBar hidden />
        <Text style={styles.error}>Storage unavailable</Text>
        <Text style={styles.body}>{session.bootError}</Text>
      </View>
    );
  }

  if (!session.snapshot) {
    return (
      <View style={styles.shell}>
        <StatusBar hidden />
        <Text style={styles.body}>Starting…</Text>
      </View>
    );
  }

  const showConnect =
    session.wizardStep === "connect" || session.contentRoute === "connect";
  const showChoose =
    session.wizardStep === "choose" || session.contentRoute === "choose";

  if (showConnect) {
    return (
      <>
        <StatusBar hidden />
        <ConnectYouTubeScreen
          allowDisconnect={session.contentRoute === "connect"}
          onAuthChanged={() => {
            void session.refreshSignedIn();
          }}
          onConnected={() => {
            void session.refreshSignedIn();
            if (session.wizardStep === "connect") {
              session.goWizardChoose();
            } else {
              session.closeContent();
            }
          }}
          onUseLinksInstead={() => {
            if (session.wizardStep === "connect") {
              session.goWizardChoose();
            } else {
              session.openChoose();
            }
          }}
          onCancel={
            session.contentRoute === "connect"
              ? session.closeContent
              : undefined
          }
        />
      </>
    );
  }

  if (showChoose && session.allowlistRepo) {
    return (
      <>
        <StatusBar hidden />
        <ChooseContentScreen
          allowlist={session.allowlistRepo}
          onSaved={session.onAllowlistSaved}
          onAuthChanged={() => {
            void session.refreshSignedIn();
          }}
          onBack={
            session.contentRoute === "choose"
              ? session.closeContent
              : session.goWizardConnect
          }
        />
      </>
    );
  }

  if (session.showSettings) {
    return (
      <>
        <StatusBar hidden />
        <ParentSettingsScreen
          snapshot={session.snapshot}
          unlocked={session.settingsUnlocked}
          pinPending={session.pinPending}
          signedIn={session.signedIn}
          allowlistCount={session.allowlistEntries.length}
          onVerify={session.verifyPin}
          onChangePolicy={session.changePolicy}
          onResetCycle={session.resetCycle}
          onConnect={() => session.openConnect()}
          onManageContent={() => session.openChoose()}
          onClose={session.closeSettings}
        />
      </>
    );
  }

  if (session.wizardStep === "welcome") {
    return (
      <>
        <StatusBar hidden />
        <WelcomeScreen onStart={session.startSetup} />
      </>
    );
  }

  if (session.wizardStep === "timerSetup") {
    return (
      <>
        <StatusBar hidden />
        <TimerSetupScreen
          pinPending={session.pinPending}
          onSave={session.completeSetup}
        />
      </>
    );
  }

  const { snapshot } = session;
  if (snapshot.phase === "AwaitingConfirmation") {
    return (
      <>
        <StatusBar hidden />
        <ReadyScreen
          snapshot={snapshot}
          allowlistEmpty={session.allowlistEntries.length === 0}
          onContinue={() => {
            session.confirmWatching();
          }}
          onOpenSettings={session.openSettings}
        />
      </>
    );
  }
  if (snapshot.phase === "Resting") {
    return (
      <>
        <StatusBar hidden />
        <RestScreen snapshot={snapshot} onOpenSettings={session.openSettings} />
      </>
    );
  }
  if (snapshot.phase === "Playing") {
    return (
      <>
        <StatusBar hidden />
        <PlayingShell
          snapshot={snapshot}
          onOpenSettings={session.openSettings}
        />
      </>
    );
  }

  return (
    <View style={styles.shell}>
      <StatusBar hidden />
      <Text style={styles.body}>Unexpected phase</Text>
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
  },
  body: { color: colors.offWhite, fontSize: 28 },
  error: {
    color: colors.amber,
    fontSize: 36,
    fontWeight: "700",
    marginBottom: 16,
  },
});
