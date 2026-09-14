import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join("boundary-fixtures", "imports-react-native.ts");

describe("RN-D2 import boundary", () => {
  it("fails the cruiser job when a fixture imports react-native", () => {
    const result = spawnSync(
      "pnpm",
      ["exec", "depcruise", "--config", ".dependency-cruiser.cjs", fixture],
      { cwd: pkgRoot, encoding: "utf8" },
    );
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/react-native|no-react-native-in-core/);
  });
});
