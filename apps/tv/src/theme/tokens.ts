import { useWindowDimensions } from "react-native";

/** Colors from designs/littleplay.pen */
export const colors = {
  navy: "#0A101C",
  panel: "#121C2B",
  panel2: "#192638",
  offWhite: "#F5F2EA",
  muted: "#94A3B8",
  coral: "#FF7657",
  coralDark: "#5B2A25",
  amber: "#F8C65D",
  green: "#65D6A6",
  danger: "#311A1B",
  dangerText: "#FF9A83",
  white10: "rgba(255,255,255,0.10)",
  white20: "rgba(255,255,255,0.20)",
  scrim: "rgba(13,23,37,0.80)",
  panelScrim: "rgba(21,35,55,0.80)",
} as const;

/** @deprecated Prefer useLayout().safe — kept for non-hook call sites. */
export const safe = {
  horizontal: "5%" as unknown as number,
  vertical: "5%" as unknown as number,
};

const DESIGN_H = 1080;
/** Keep the 1080p composition airy without making controls dominate at TV density. */
const TV_UI_DENSITY = 0.82;

export type LayoutMetrics = {
  width: number;
  height: number;
  /** Multiplier vs 1080p design height — use for type/spacing that must shrink. */
  scale: number;
  safeX: number;
  safeY: number;
  s: (designPx: number) => number;
};

export function useLayout(): LayoutMetrics {
  const { width, height } = useWindowDimensions();
  const viewportScale = Math.min(width / 1920, height / DESIGN_H);
  const scale = Math.min(viewportScale, 1) * TV_UI_DENSITY;
  return {
    width,
    height,
    scale,
    safeX: width * 0.05,
    safeY: height * 0.05,
    s: (designPx: number) => Math.max(10, Math.round(designPx * scale)),
  };
}
