import { useCallback } from "react";
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { duration, EASE_OUT, pressScale } from "../../theme/motion";

/** Near-imperceptible press scale for D-pad Select / touch. Focus stays instant. */
export function usePressScale() {
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  const onPressIn = useCallback(() => {
    if (reduced) return;
    scale.set(
      withTiming(pressScale, { duration: duration.press, easing: EASE_OUT }),
    );
  }, [reduced, scale]);

  const onPressOut = useCallback(() => {
    scale.set(withTiming(1, { duration: duration.press, easing: EASE_OUT }));
  }, [scale]);

  return { animatedStyle, onPressIn, onPressOut, reduced };
}
