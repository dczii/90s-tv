import { describe, expect, it } from "vitest";
import {
  pollDeviceToken,
  requestDeviceCode,
  type YoutubeOAuthConfig,
} from "./deviceCodeAuth";

const config: YoutubeOAuthConfig = {
  clientId: "client",
  clientSecret: "secret",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("device-code OAuth poll state machine", () => {
  it("maps authorization_pending → pending, then success", async () => {
    let n = 0;
    const fetchImpl: typeof fetch = async () => {
      n += 1;
      if (n === 1) {
        return jsonResponse(400, { error: "authorization_pending" });
      }
      return jsonResponse(200, {
        access_token: "a",
        refresh_token: "r",
        expires_in: 3600,
        token_type: "Bearer",
      });
    };
    expect(await pollDeviceToken(config, "dc", fetchImpl)).toEqual({
      status: "pending",
    });
    const ok = await pollDeviceToken(config, "dc", fetchImpl);
    expect(ok.status).toBe("success");
  });

  it("maps expired_token and access_denied", async () => {
    const expired = await pollDeviceToken(config, "dc", async () =>
      jsonResponse(400, { error: "expired_token" }),
    );
    expect(expired).toMatchObject({
      status: "error",
      error: { kind: "AuthDeviceCodeExpired" },
    });
    const denied = await pollDeviceToken(config, "dc", async () =>
      jsonResponse(400, { error: "access_denied" }),
    );
    expect(denied).toMatchObject({
      status: "error",
      error: { kind: "AuthDenied" },
    });
  });

  it("maps slow_down", async () => {
    const r = await pollDeviceToken(config, "dc", async () =>
      jsonResponse(400, { error: "slow_down" }),
    );
    expect(r.status).toBe("slow_down");
  });

  it("requestDeviceCode returns structured fields", async () => {
    const r = await requestDeviceCode(config, async () =>
      jsonResponse(200, {
        device_code: "dc",
        user_code: "ABCD-EFGH",
        verification_url: "https://www.google.com/device",
        expires_in: 1800,
        interval: 5,
      }),
    );
    expect(r).toMatchObject({
      deviceCode: "dc",
      userCode: "ABCD-EFGH",
      interval: 5,
    });
  });
});
