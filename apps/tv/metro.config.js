const path = require("node:path");
const fs = require("node:fs");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

/**
 * packages/core uses TypeScript ESM (import "./foo.js" → foo.ts).
 * Metro does not rewrite .js → .ts by default for workspace packages.
 */
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    typeof moduleName === "string" &&
    moduleName.endsWith(".js") &&
    !moduleName.includes("node_modules")
  ) {
    const origin = context.originModulePath;
    if (
      typeof origin === "string" &&
      origin.includes(`${path.sep}packages${path.sep}core${path.sep}`)
    ) {
      const asTs = moduleName.replace(/\.js$/, ".ts");
      const candidate = path.resolve(path.dirname(origin), asTs);
      if (fs.existsSync(candidate)) {
        return {
          type: "sourceFile",
          filePath: candidate,
        };
      }
    }
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
