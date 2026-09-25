import type { AllowlistKind } from "@littleplay/core";

export type PresetItem = {
  id: string;
  kind: AllowlistKind;
  title: string;
  description: string;
  thumbnailUrl: string;
  /** Canonical YouTube URL for reference / future refresh. */
  url: string;
  /**
   * First playable video ids for catalog mode when Data API expand is
   * unavailable (restricted API key, offline, etc.).
   */
  seedVideoIds: readonly string[];
};

/**
 * App-bundled content parents can pick without connecting YouTube.
 * Prefer playlist?list= ids. A watch?v=&list= URL is a Video unless stored
 * as the playlist id explicitly.
 */
export const PRESET_PLAYLISTS: readonly PresetItem[] = [
  {
    id: "PL74xflqy0ma87hLDtQl06YtQYCm4kcuju",
    kind: "Playlist",
    title: "Little Bear",
    description: "Little Bear | All Episodes",
    thumbnailUrl: "https://i.ytimg.com/vi/nCkvQ10y_Zo/hqdefault.jpg",
    url: "https://www.youtube.com/playlist?list=PL74xflqy0ma87hLDtQl06YtQYCm4kcuju",
    seedVideoIds: ["nCkvQ10y_Zo"],
  },
  {
    id: "PLzzN_Z84FXi-5i6rbGw7Nk82hbC_Y3fxS",
    kind: "Playlist",
    title: "Bear in the Big Blue House",
    description: "Shapes, Sounds & Colors with Bear",
    thumbnailUrl: "https://i.ytimg.com/vi/A1SaFUKjnqA/hqdefault.jpg",
    url: "https://www.youtube.com/playlist?list=PLzzN_Z84FXi-5i6rbGw7Nk82hbC_Y3fxS",
    seedVideoIds: ["A1SaFUKjnqA"],
  },
  {
    id: "PLGbBuikY0YkEF3rxDz6J3RgWMqQ7EekDB",
    kind: "Playlist",
    title: "Franklin the Turtle",
    description: "Franklin the Turtle — full episodes",
    thumbnailUrl: "https://i.ytimg.com/vi/MXPccUSEHJY/hqdefault.jpg",
    url: "https://www.youtube.com/playlist?list=PLGbBuikY0YkEF3rxDz6J3RgWMqQ7EekDB",
    seedVideoIds: ["MXPccUSEHJY"],
  },
  {
    id: "PLdkj6XH8GYPTnhk-3uYtUYvoDbAt9TGCy",
    kind: "Playlist",
    title: "All About The Alphabet",
    description: "Noodle & Pals alphabet songs",
    thumbnailUrl: "https://i.ytimg.com/vi/Wk3K9PLtNUQ/hqdefault.jpg",
    url: "https://www.youtube.com/playlist?list=PLdkj6XH8GYPTnhk-3uYtUYvoDbAt9TGCy",
    seedVideoIds: ["Wk3K9PLtNUQ"],
  },
  {
    id: "5gZOYKHXwyQ",
    kind: "Video",
    title: "Nursery Rhymes Compilation",
    description: "Itsy Bitsy Spider + more kids songs",
    thumbnailUrl: "https://i.ytimg.com/vi/5gZOYKHXwyQ/hqdefault.jpg",
    url: "https://www.youtube.com/watch?v=5gZOYKHXwyQ",
    seedVideoIds: ["5gZOYKHXwyQ"],
  },
  {
    id: "7FWmHMT2Aag",
    kind: "Video",
    title: "Dora the Explorer",
    description: "Dora full episodes marathon — 2 hours",
    thumbnailUrl: "https://i.ytimg.com/vi/7FWmHMT2Aag/hqdefault.jpg",
    url: "https://www.youtube.com/watch?v=7FWmHMT2Aag",
    seedVideoIds: ["7FWmHMT2Aag"],
  },
  {
    id: "JmFiRwntHwc",
    kind: "Video",
    title: "The New Adventures of Winnie the Pooh",
    description: "Full episode marathon",
    thumbnailUrl: "https://i.ytimg.com/vi/JmFiRwntHwc/hqdefault.jpg",
    url: "https://www.youtube.com/watch?v=JmFiRwntHwc",
    seedVideoIds: ["JmFiRwntHwc"],
  },
  {
    id: "vFNeVBjWiQk",
    kind: "Video",
    title: "Letters with Pooh",
    description: "Learn the alphabet with Winnie the Pooh",
    thumbnailUrl: "https://i.ytimg.com/vi/vFNeVBjWiQk/hqdefault.jpg",
    url: "https://www.youtube.com/watch?v=vFNeVBjWiQk",
    seedVideoIds: ["vFNeVBjWiQk"],
  },
  {
    id: "KPCBnO9nWCk",
    kind: "Video",
    title: "Postman Pat",
    description: "A Day at the Seaside — 1 hour of full episodes",
    thumbnailUrl: "https://i.ytimg.com/vi/KPCBnO9nWCk/hqdefault.jpg",
    url: "https://www.youtube.com/watch?v=KPCBnO9nWCk",
    seedVideoIds: ["KPCBnO9nWCk"],
  },
];

export function seedVideoIdsFor(entryId: string): readonly string[] {
  return PRESET_PLAYLISTS.find((p) => p.id === entryId)?.seedVideoIds ?? [];
}
