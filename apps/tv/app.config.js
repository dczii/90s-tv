const path = require("node:path");

/** @type {import('expo/config').ExpoConfig} */
module.exports = ({ config }) => {
  // Secrets from env / local .env — never commit real values (YT-D19).
  require("dotenv").config({
    path: path.join(__dirname, ".env"),
  });

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
