const fs = require("node:fs");
const path = require("node:path");

/** @type {import('expo/config').ExpoConfig} */
module.exports = ({ config }) => {
  // Prefer apps/tv/.env; fall back to repo-root .env for local DX.
  // Never commit real values (YT-D19 / RN-03).
  const dotenv = require("dotenv");
  const candidates = [
    path.join(__dirname, ".env"),
    path.join(__dirname, "..", "..", ".env"),
  ];
  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      break;
    }
  }

  return {
    ...config,
    extra: {
      ...(config.extra ?? {}),
      youtubeApiKey: process.env.YOUTUBE_API_KEY ?? "",
      youtubeClientId: process.env.YOUTUBE_CLIENT_ID ?? "",
      youtubeClientSecret: process.env.YOUTUBE_CLIENT_SECRET ?? "",
    },
  };
};
