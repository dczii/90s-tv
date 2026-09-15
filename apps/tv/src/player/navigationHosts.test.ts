import { describe, expect, it } from "vitest";
import { isAllowedNavigationHost } from "./navigationHosts";

describe("isAllowedNavigationHost", () => {
  it("allows asset origin and youtube/google hosts", () => {
    expect(isAllowedNavigationHost("appassets.androidplatform.net")).toBe(true);
    expect(isAllowedNavigationHost("www.youtube.com")).toBe(true);
    expect(isAllowedNavigationHost("youtu.be")).toBe(true);
    expect(isAllowedNavigationHost("accounts.google.com")).toBe(true);
    expect(isAllowedNavigationHost("i.ytimg.com")).toBe(true);
    expect(isAllowedNavigationHost("www.gstatic.com")).toBe(true);
  });

  it("blocks unknown and empty hosts", () => {
    expect(isAllowedNavigationHost(null)).toBe(false);
    expect(isAllowedNavigationHost("")).toBe(false);
    expect(isAllowedNavigationHost("evil.example")).toBe(false);
    // Not listed on purpose — media is a subresource, never a navigation allow.
    expect(isAllowedNavigationHost("redirect.othercdn.net")).toBe(false);
  });
});
