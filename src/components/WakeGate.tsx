"use client";

import { useEffect, useState } from "react";
import { Emblem } from "./Emblem";

/**
 * Free hosting sleeps when idle. If the server takes more than a moment to answer a health check,
 * show a calm "waking up" screen instead of a page whose buttons silently hang.
 */
export function WakeGate() {
  const [waking, setWaking] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    let done = false;
    const slow = setTimeout(() => !done && setWaking(true), 1200);
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    const ping = async () => {
      for (let i = 0; i < 30 && !done; i++) {
        try {
          const res = await fetch("/api/health", { cache: "no-store" });
          if (res.ok) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 2000));
      }
      done = true;
      clearTimeout(slow);
      clearInterval(tick);
      setWaking(false);
    };
    ping();
    return () => {
      done = true;
      clearTimeout(slow);
      clearInterval(tick);
    };
  }, []);

  if (!waking) return null;
  return (
    <div role="status" aria-live="polite" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-bg/95 px-6 text-center backdrop-blur">
      <Emblem size={56} state={{ mode: "busy" }} />
      <div>
        <p className="text-lg font-semibold">Waking up the shield…</p>
        <p className="mt-1 text-sm text-muted">The free server naps when nobody is around. This takes about a minute, once.</p>
      </div>
      <div className="h-1 w-56 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-brand transition-[width] duration-1000" style={{ width: `${Math.min(95, seconds * 2)}%` }} />
      </div>
    </div>
  );
}
