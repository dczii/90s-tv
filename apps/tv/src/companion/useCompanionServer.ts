import { useCallback, useEffect, useRef, useState } from "react";
import { getRandomBytes } from "expo-crypto";
import {
  addCompanionRequestListener,
  addCompanionStoppedListener,
  respondCompanion,
  startCompanionServer,
  stopCompanionServer,
} from "companion-server";
import {
  handleCompanionRequest,
  type CompanionActivity,
  type CompanionDeps,
} from "./handler";
import { lookupLink } from "./lookup";

/** The phone link works for this long, then the parent scans again. */
export const COMPANION_TTL_MS = 10 * 60_000;

export type CompanionStatus =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "running"; url: string; expiresAtMs: number }
  | { kind: "noNetwork" }
  | { kind: "expired" }
  | { kind: "error"; message: string };

export type CompanionHostDeps = Omit<
  CompanionDeps,
  "token" | "lookup" | "now" | "onActivity"
>;

function newToken(): string {
  return Array.from(getRandomBytes(16), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export type PhoneRemote = {
  status: CompanionStatus;
  activity: CompanionActivity[];
  restart: () => void;
};

/**
 * Runs the phone remote server while `active`: fresh token per start, stops
 * when inactive, on unmount, or after COMPANION_TTL_MS. Lives in RootApp so
 * a phase change that remounts Parent settings doesn't kill the link.
 * Requests always see the latest deps.
 */
export function useCompanionServer(
  deps: CompanionHostDeps | undefined,
  active: boolean,
): PhoneRemote {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const [status, setStatus] = useState<CompanionStatus>({ kind: "idle" });
  const [activity, setActivity] = useState<CompanionActivity[]>([]);
  const [generation, setGeneration] = useState(0);

  const running = active && deps !== undefined;

  useEffect(() => {
    if (!running) {
      setStatus({ kind: "idle" });
      return;
    }
    let cancelled = false;
    const token = newToken();
    setStatus({ kind: "starting" });
    setActivity([]);

    const onActivity = (a: CompanionActivity) => {
      if (cancelled) return;
      setActivity((prev) =>
        a.kind === "connected" && prev[0]?.kind === "connected"
          ? prev
          : [a, ...prev].slice(0, 4),
      );
    };

    const requestSub = addCompanionRequestListener((req) => {
      const current = depsRef.current;
      if (!current) {
        respondCompanion(req.id, 503, "text/plain; charset=utf-8", "Not ready", {});
        return;
      }
      void handleCompanionRequest(req, {
        ...current,
        token,
        lookup: (parsed) => lookupLink(parsed),
        now: () => Date.now(),
        onActivity,
      }).then((res) => {
        respondCompanion(
          req.id,
          res.status,
          res.contentType,
          res.body,
          res.headers ?? {},
        );
      });
    });
    const stoppedSub = addCompanionStoppedListener(() => {
      if (!cancelled) setStatus({ kind: "expired" });
    });

    startCompanionServer(token, COMPANION_TTL_MS).then(
      ({ host, port }) => {
        if (cancelled) return;
        if (!host || !port) {
          setStatus({ kind: "noNetwork" });
          return;
        }
        setStatus({
          kind: "running",
          url: `http://${host}:${port}/?t=${token}`,
          expiresAtMs: Date.now() + COMPANION_TTL_MS,
        });
      },
      (err: unknown) => {
        if (cancelled) return;
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      },
    );

    return () => {
      cancelled = true;
      requestSub.remove();
      stoppedSub.remove();
      stopCompanionServer(token);
    };
  }, [generation, running]);

  const restart = useCallback(() => setGeneration((g) => g + 1), []);

  return { status, activity, restart };
}
