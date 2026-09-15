import { Easing } from "react-native-reanimated";

/** Strong ease-out for UI enter/exit (AUDIT.md / animate-expo). */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/** Strong ease-in-out for on-screen movement. */
export const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

/** Linear for continuous progress (rest ring). */
export const EASE_LINEAR = Easing.linear;

export const duration = {
  /** Press scale feedback */
  press: 120,
  /** Chip / overlay / small state */
  fast: 160,
  /** Screen crossfade, pill color */
  screen: 220,
  /** Welcome stagger step */
  stagger: 50,
} as const;

export const pressScale = 0.97;
export const popScaleFrom = 0.92;
