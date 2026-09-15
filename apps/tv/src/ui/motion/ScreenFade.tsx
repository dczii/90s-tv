import { type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  useReducedMotion,
} from "react-native-reanimated";
import { duration, EASE_OUT } from "../../theme/motion";

type Props = {
  screenKey: string;
  children: ReactNode;
};

/**
 * Opacity crossfade when RootApp swaps screens. No router (RN-D5) —
 * this is the hand-rolled fade that stack navigation would have provided.
 */
export function ScreenFade({ screenKey, children }: Props) {
  const reduced = useReducedMotion();

  return (
    <View style={styles.root}>
      <Animated.View
        key={screenKey}
        entering={
          reduced
            ? undefined
            : FadeIn.duration(duration.screen).easing(EASE_OUT)
        }
        exiting={
          reduced
            ? undefined
            : FadeOut.duration(duration.fast).easing(EASE_OUT)
        }
        style={styles.fills}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fills: { flex: 1 },
});
