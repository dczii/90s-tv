import { NativeModule, requireNativeModule } from "expo-modules-core";

declare class AndroidIdentityNativeModule extends NativeModule {
  packageName(): string;
  signingCertSha1Hex(): string;
}

const AndroidIdentity =
  requireNativeModule<AndroidIdentityNativeModule>("AndroidIdentity");

export function androidPackageName(): string {
  return AndroidIdentity.packageName();
}

/** Lowercase hex, no colons (YT-D19 / RN-D18). */
export function signingCertSha1Hex(): string {
  return AndroidIdentity.signingCertSha1Hex();
}
