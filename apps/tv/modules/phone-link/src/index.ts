import { NativeModule, requireNativeModule } from "expo-modules-core";
import type { EventSubscription } from "expo-modules-core";

export type PhoneLinkRequestEvent = {
  id: string;
  method: string;
  route: string;
  body: string;
  entryId: string;
};

type PhoneLinkEvents = {
  onHttpRequest: (event: PhoneLinkRequestEvent) => void;
};

declare class PhoneLinkNativeModule extends NativeModule<PhoneLinkEvents> {
  start(token: string): { port: number };
  stop(): void;
  lanIpv4(): string;
  respond(id: string, status: number, body: string): void;
}

const PhoneLink = requireNativeModule<PhoneLinkNativeModule>("PhoneLink");

export function startPhoneLinkServer(token: string): { port: number } {
  return PhoneLink.start(token);
}

export function stopPhoneLinkServer(): void {
  PhoneLink.stop();
}

export function lanIpv4(): string {
  return PhoneLink.lanIpv4();
}

export function respondPhoneLink(
  id: string,
  status: number,
  body: string,
): void {
  PhoneLink.respond(id, status, body);
}

export function addPhoneLinkRequestListener(
  listener: (event: PhoneLinkRequestEvent) => void,
): EventSubscription {
  return PhoneLink.addListener("onHttpRequest", listener);
}
