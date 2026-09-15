import type { AllowlistKind } from "@littleplay/core";

export type PresetItem = {
  id: string;
  kind: AllowlistKind;
  title: string;
  description: string;
  thumbnailUrl: string;
  /** Canonical YouTube URL for reference / future refresh. */
  url: string;
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
  },
  {
    id: "PLzzN_Z84FXi-5i6rbGw7Nk82hbC_Y3fxS",
    kind: "Playlist",
    title: "Bear in the Big Blue House",
    description: "Shapes, Sounds & Colors with Bear",
    thumbnailUrl: "https://i.ytimg.com/vi/A1SaFUKjnqA/hqdefault.jpg",
    url: "https://www.youtube.com/playlist?list=PLzzN_Z84FXi-5i6rbGw7Nk82hbC_Y3fxS",
  },
  {
    id: "PLGbBuikY0YkEF3rxDz6J3RgWMqQ7EekDB",
    kind: "Playlist",
    title: "Franklin the Turtle",
    description: "Franklin the Turtle — full episodes",
    thumbnailUrl: "https://i.ytimg.com/vi/MXPccUSEHJY/hqdefault.jpg",
    url: "https://www.youtube.com/playlist?list=PLGbBuikY0YkEF3rxDz6J3RgWMqQ7EekDB",
  },
  {
    id: "PLdkj6XH8GYPTnhk-3uYtUYvoDbAt9TGCy",
    kind: "Playlist",
    title: "All About The Alphabet",
    description: "Noodle & Pals alphabet songs",
    thumbnailUrl: "https://i.ytimg.com/vi/Wk3K9PLtNUQ/hqdefault.jpg",
    url: "https://www.youtube.com/playlist?list=PLdkj6XH8GYPTnhk-3uYtUYvoDbAt9TGCy",
  },
  {
    id: "5gZOYKHXwyQ",
    kind: "Video",
    title: "Nursery Rhymes Compilation",
    description: "Itsy Bitsy Spider + more kids songs",
    thumbnailUrl: "https://i.ytimg.com/vi/5gZOYKHXwyQ/hqdefault.jpg",
    url: "https://www.youtube.com/watch?v=5gZOYKHXwyQ",
  },
];
