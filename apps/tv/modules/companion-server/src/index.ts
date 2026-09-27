import { NativeModule, requireNativeModule } from "expo-modules-core";
import type { EventSubscription } from "expo-modules-core";

export type CompanionNativeRequest = {
  id: string;
  method: string;
  path: string;
  query: string;
  body: string;
};

type CompanionServerEvents = {
  onRequest: (req: CompanionNativeRequest) => void;
  onStopped: () => void;
};

declare class CompanionServerNativeModule extends NativeModule<CompanionServerEvents> {
  start(
    session: string,
    ttlMs: number,
  ): Promise<{ host: string | null; port: number | null }>;
  stop(session: string): void;
  respond(
    id: string,
    status: number,
    contentType: string,
    body: string,
    headers: Record<string, string>,
  ): void;
}

const CompanionServer =
  requireNativeModule<CompanionServerNativeModule>("CompanionServer");

/**
 * Start the LAN server for one session (the token works as the id). Host is
 * null when the TV has no private IPv4 or the session was already stopped.
 */
export function startCompanionServer(
  session: string,
  ttlMs: number,
): Promise<{ host: string | null; port: number | null }> {
  return CompanionServer.start(session, ttlMs);
}

/** Stop that session's server; also cancels a start still in flight. */
export function stopCompanionServer(session: string): void {
  CompanionServer.stop(session);
}

export function respondCompanion(
  id: string,
  status: number,
  contentType: string,
  body: string,
  headers: Record<string, string>,
): void {
  CompanionServer.respond(id, status, contentType, body, headers);
}

export function addCompanionRequestListener(
  listener: (req: CompanionNativeRequest) => void,
): EventSubscription {
  return CompanionServer.addListener("onRequest", listener);
}

/** Fires when the server stops on its own (time limit or socket error). */
export function addCompanionStoppedListener(
  listener: () => void,
): EventSubscription {
  return CompanionServer.addListener("onStopped", listener);
}
