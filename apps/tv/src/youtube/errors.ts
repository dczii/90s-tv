import type { AllowlistError } from "@littleplay/core";
import type { AuthErrorKind } from "./deviceCodeAuth";

/** Parent-visible strings for named Step 3 failures (YT-03 / RN-03). */
export const PARENT_COPY = {
  NetworkDown:
    "Network unavailable. Showing saved content if any — try again when online.",
  AuthExpired: "YouTube sign-in expired. Connect again from Parent settings.",
  AuthRevoked: "Google revoked access. Connect again.",
  AuthDenied: "You cancelled on Google.",
  AuthDeviceCodeExpired: "The code expired. Generate a new one.",
  AuthCancelled: "Sign-in cancelled.",
  AuthConfigMissing: "YouTube is not configured on this device.",
  AuthSecureStoreUnavailable: "Cannot store Google sign-in on this device.",
  QuotaExceeded:
    "YouTube daily limit reached. Try again tomorrow.",
  ConfigMissing: "YouTube is not configured on this device.",
  HttpError: "YouTube could not be reached. Try again.",
  NotEmbeddable:
    "This video can't play inside the app. It was saved but will be skipped when watching.",
  PrivateBlocked: "That video is private and can't play here.",
  AgeRestricted: "That video is age-restricted and can't play here.",
  RegionRestricted: "That video is blocked in this region.",
  Removed: "That video is no longer available.",
  Empty: "Select at least one playlist before continuing.",
  NoPlayableItem: "None of the allowed items can play right now.",
  MalformedUrl: "That does not look like a YouTube URL.",
  UnsupportedHost:
    "That YouTube link type is not supported. Use a video or playlist URL.",
} as const;

export function messageForAuthKind(kind: AuthErrorKind): string {
  return PARENT_COPY[kind] ?? PARENT_COPY.AuthExpired;
}

export function messageForApiError(err: {
  kind: string;
  message?: string;
}): string {
  switch (err.kind) {
    case "NetworkDown":
      return PARENT_COPY.NetworkDown;
    case "QuotaExceeded":
      return PARENT_COPY.QuotaExceeded;
    case "AuthExpired":
      return PARENT_COPY.AuthExpired;
    case "AuthRevoked":
      return PARENT_COPY.AuthRevoked;
    case "ConfigMissing":
      return PARENT_COPY.ConfigMissing;
    case "HttpError":
      return PARENT_COPY.HttpError;
    default:
      return err.message ?? PARENT_COPY.HttpError;
  }
}

export function messageForAllowlistError(err: AllowlistError): string {
  switch (err.kind) {
    case "NotEmbeddable":
      return PARENT_COPY.NotEmbeddable;
    case "PrivateBlocked":
      return PARENT_COPY.PrivateBlocked;
    case "AgeRestricted":
      return PARENT_COPY.AgeRestricted;
    case "RegionRestricted":
      return PARENT_COPY.RegionRestricted;
    case "Removed":
      return PARENT_COPY.Removed;
    case "MalformedUrl":
      return PARENT_COPY.MalformedUrl;
    case "UnsupportedHost":
      return PARENT_COPY.UnsupportedHost;
    case "Empty":
      return PARENT_COPY.Empty;
    case "NoPlayableItem":
      return PARENT_COPY.NoPlayableItem;
    default:
      return PARENT_COPY.HttpError;
  }
}
