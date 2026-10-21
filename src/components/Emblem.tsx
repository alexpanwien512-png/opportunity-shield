"use client";

import { useEffect, useState } from "react";
import type { Verdict } from "@/lib/shield/types";

export type ShieldState = { mode: "idle" } | { mode: "busy" } | { mode: "verdict"; verdict: Verdict };

/** Pages announce what the agent is doing; the emblem in the nav reacts. */
export function announce(state: ShieldState) {
  window.dispatchEvent(new CustomEvent<ShieldState>("shield:state", { detail: state }));
}

const COLOR: Record<Verdict, string> = { APPLY: "var(--apply)", CAUTION: "var(--caution)", AVOID: "var(--avoid)" };

/** The shield ◆ emblem: breathes when idle, pulses while analyzing, takes the verdict colour after. */
export function Emblem({ size = 28, state: fixed }: { size?: number; state?: ShieldState }) {
  const [state, setState] = useState<ShieldState>(fixed ?? { mode: "idle" });
  useEffect(() => {
    if (fixed) return;
    const on = (e: Event) => setState((e as CustomEvent<ShieldState>).detail);
    window.addEventListener("shield:state", on);
    return () => window.removeEventListener("shield:state", on);
  }, [fixed]);

  const color = state.mode === "verdict" ? COLOR[state.verdict] : "var(--brand)";
  const busy = state.mode === "busy";
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} aria-hidden>
      {busy && <span className="absolute inset-0 rounded-full" style={{ background: color, animation: "pulse-ring 1.2s ease-out infinite", opacity: 0.5 }} />}
      <svg width={size} height={size} viewBox="0 0 32 32" className="relative">
        <path d="M16 2.5 27 6.5v8.2c0 7-4.6 12.3-11 14.8C9.6 27 5 21.7 5 14.7V6.5L16 2.5Z" fill="none" stroke={color} strokeWidth="1.8" style={{ transition: "stroke 300ms" }} />
        <path
          d="M16 9.5 21 15l-5 5.5-5-5.5L16 9.5Z"
          fill={color}
          style={{ transition: "fill 300ms", animation: busy ? "breathe 0.8s ease-in-out infinite" : state.mode === "idle" ? "breathe 4s ease-in-out infinite" : undefined }}
        />
      </svg>
    </span>
  );
}
