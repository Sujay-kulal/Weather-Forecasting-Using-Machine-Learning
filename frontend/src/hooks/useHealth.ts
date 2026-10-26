import { useEffect, useState } from "react";
import { getHealth } from "../services/api";
import type { HealthResponse } from "../types/api";

export type HealthState = "checking" | "ok" | "degraded" | "down";

/** Polls GET /health every 30 s for the header indicator. */
export function useHealth(): { health: HealthState; detail: string; waking: boolean; retry: () => void } {
  const [health, setHealth] = useState<HealthState>("checking");
  const [detail, setDetail] = useState("checking backend…");
  const [waking, setWaking] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let settled = false;
    setHealth("checking");
    setWaking(false);
    const wakeTimer = window.setTimeout(() => {
      if (!cancelled && !settled) setWaking(true);
    }, 3000);

    async function check() {
      try {
        const h: HealthResponse = await getHealth();
        if (cancelled) return;
        settled = true;
        window.clearTimeout(wakeTimer);
        setWaking(false);
        if (h.status === "healthy" && h.model_loaded) {
          setHealth("ok");
          setDetail("backend connected · model loaded");
        } else {
          setHealth("degraded");
          setDetail(`backend ${h.status} · database ${h.database} · model ${
            h.model_loaded ? "loaded" : "not loaded"}`);
        }
      } catch {
        settled = true;
        window.clearTimeout(wakeTimer);
        if (!cancelled) setWaking(false);
        if (!cancelled) {
          setHealth("down");
          setDetail("backend unreachable");
        }
      }
    }

    check();
    const id = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.clearTimeout(wakeTimer);
    };
  }, [attempt]);

  return { health, detail, waking, retry: () => setAttempt((value) => value + 1) };
}
