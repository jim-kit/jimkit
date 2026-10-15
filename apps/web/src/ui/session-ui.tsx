"use client";

import type { SessionView, Tier } from "@jimkit/sdk";
import { Btn, formatBytes, toast } from "@jimkit/ui";
import { Lock, LockOpen, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "./providers";

export const TIER_LABEL: Record<Tier, string> = { trusted: "Trusted", unlocked: "Unlocked", public: "Public" };

export function TierIcon({ tier, size = 15 }: { tier: Tier; size?: number }) {
  const I = tier === "trusted" ? Wifi : tier === "unlocked" ? LockOpen : Lock;
  return <I size={size} />;
}

export const tierColor = (t: Tier) => (t === "trusted" ? "var(--color-ok)" : t === "unlocked" ? "var(--color-accent)" : "var(--color-warn)");

export function useCountdown(session: SessionView) {
  const { refreshSession } = useApp();
  const [now, setNow] = useState(session.now);
  useEffect(() => {
    // a new session (just unlocked, or refreshed) starts from its own clock, not from the page's first one
    setNow(session.now);
    if (session.expiresAt === null) return;
    const skew = session.now - Date.now();
    let asked = false;
    const id = setInterval(() => {
      const t = Date.now() + skew;
      setNow(t);
      // time is up: the server says what you are now (public), so tools that need the unlock stop opening
      if (!asked && session.expiresAt !== null && t >= session.expiresAt) { asked = true; void refreshSession(); }
    }, 1000);
    return () => clearInterval(id);
  }, [session.expiresAt, session.now, refreshSession]);
  return session.expiresAt === null ? null : Math.max(0, session.expiresAt - now);
}

export function formatCountdown(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function limitRows(s: SessionView) {
  const L = s.limits;
  return [
    ["Per file", formatBytes(L.maxFileBytes, 0)],
    ["Per batch", formatBytes(L.maxBatchBytes, 0)],
    ["Files at once", String(L.maxFiles)],
    ["Jobs at once", String(L.concurrentJobs)],
    ["Job time limit", L.jobTimeoutSec >= 3600 ? `${Math.round(L.jobTimeoutSec / 3600)} h` : `${Math.round(L.jobTimeoutSec / 60)} min`],
    ["Daily total", L.dailyBytes === null ? "Unlimited" : formatBytes(L.dailyBytes, 0)],
    ["Bandwidth", L.bandwidthMbit === null ? "Uncapped" : `${L.bandwidthMbit} Mbit/s`],
  ] as const;
}

/** The unlock-code box, shown wherever a public visitor could use it. */
export function UnlockForm({ onDone }: { onDone?: () => void }) {
  const { session, setSession } = useApp();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!session.unlockAvailable) return <p className="text-[13px] text-faint">Unlocking is turned off on this server.</p>;
  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!code || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
      const body = await r.json();
      if (r.ok) { setSession(body); setCode(""); toast.success("Unlocked", { description: `Full limits for ${body.ttlMinutes} minutes.` }); onDone?.(); }
      else if (body.error === "locked_out") setError(`Too many tries. Wait ${Math.ceil((body.retryAfterSec ?? 60) / 60)} min.`);
      else setError(body.attemptsLeft !== undefined ? `Wrong code. ${body.attemptsLeft} ${body.attemptsLeft === 1 ? "try" : "tries"} left.` : "That didn't work.");
    } catch { setError("Couldn't reach the server."); }
    setBusy(false);
  }
  return (
    <form onSubmit={go}>
      <div className="flex items-center gap-2">
        <input value={code} onChange={(e) => { setCode(e.target.value.slice(0, 64)); setError(null); }} placeholder="Unlock code" aria-label="Unlock code" autoComplete="off" spellCheck={false}
          className="min-w-0 flex-1 rounded-xl border border-line-strong bg-field px-3 py-2 font-mono text-[14px] outline-none focus:border-accent" />
        <Btn primary type="submit" disabled={!code || busy}>Unlock</Btn>
      </div>
      {error && <p className="mt-2 text-[12.5px] text-bad">{error}</p>}
    </form>
  );
}

const DOT: Record<Tier, string> = { trusted: "var(--color-ok)", unlocked: "var(--color-accent)", public: "#ff922b" };

/** Tier readout for the rail and the top bar: the full chip where there is room, a plain coloured dot on phones. */
export function SessionChip({ onClick, dotFirst }: { onClick?: () => void; dotFirst?: boolean }) {
  const { session } = useApp();
  const left = useCountdown(session);
  const label = `${TIER_LABEL[session.tier]}${left !== null ? `, ${formatCountdown(left)} left` : ""}`;
  return (
    <>
      <button onClick={onClick} aria-label={label} title={label} className={`grid place-items-center sm:hidden ${dotFirst ? "order-first size-[38px]" : "size-9"}`}>
        <span className="size-2.5 rounded-full" style={{ background: DOT[session.tier] }} />
      </button>
      <button onClick={onClick} className={`hidden items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[12.5px] text-dim transition hover:border-line-strong hover:text-fg sm:flex ${dotFirst ? "order-first h-[38px]" : ""}`} title="Your session">
        <span style={{ color: tierColor(session.tier) }}><TierIcon tier={session.tier} size={14} /></span>
        <span className="font-medium text-fg">{TIER_LABEL[session.tier]}</span>
        {left !== null && <span className="tabular-nums text-faint">{formatCountdown(left)}</span>}
      </button>
    </>
  );
}
