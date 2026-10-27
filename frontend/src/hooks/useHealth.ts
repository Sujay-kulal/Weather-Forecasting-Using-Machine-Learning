import { useEffect, useState } from "react";
import { getHealth } from "../services/api";
import type { HealthResponse } from "../types/api";

export type HealthState = "checking" | "ok" | "degraded" | "down";

/** Polls GET /health every 30 s for the header indicator. */
export function useHealth(): { health: HealthState; detail: string } {
  const [health, setHealth] = useState<HealthState>("checking");
  const [detail, setDetail] = useState("checking backend…");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const h: HealthResponse = await getHealth();
        if (cancelled) return;
        if (h.status === "healthy" && h.model_loaded) {
          setHealth("ok");
          setDetail("backend connected · model loaded");
        } else {
          setHealth("degraded");
          setDetail(`backend ${h.status} · database ${h.database} · model ${
            h.model_loaded ? "loaded" : "not loaded"}`);
        }
      } catch {
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
    };
  }, []);

  return { health, detail };
}
