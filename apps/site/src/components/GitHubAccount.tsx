"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { loginOf, signInWithGitHub, signOut, supabase } from "@/lib/supabase";

/** The signed-in GitHub session, once Supabase has looked: undefined while it is looking, null when nobody is signed in. */
export function useGitHubSession(): { session: Session | null | undefined; login: string | null } {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    let off: (() => void) | undefined;
    let dead = false;
    void supabase().then((sb) => {
      if (dead) return;
      void sb.auth.getSession().then(({ data }) => { if (!dead) setSession(data.session); });
      const { data } = sb.auth.onAuthStateChange((_event, s) => setSession(s));
      off = () => data.subscription.unsubscribe();
    });
    return () => { dead = true; off?.(); };
  }, []);
  return { session, login: loginOf(session ?? null) };
}

const btn = "rounded-lg border border-line-strong px-4 py-2 text-[14px] font-semibold transition hover:bg-tint-2";

/** "Sign in with GitHub", or who is signed in and a way out. */
export function GitHubAccount({ login, loading }: { login: string | null; loading: boolean }) {
  if (loading) return <p className="text-[14px] text-faint">Checking sign-in…</p>;
  return login ? (
    <p className="flex flex-wrap items-center gap-3 text-[14px] text-dim">Signed in as <strong className="text-fg">{login}</strong><button onClick={() => void signOut()} className={btn}>Sign out</button></p>
  ) : (
    <button onClick={() => void signInWithGitHub()} className="rounded-lg border border-accent bg-accent px-5 py-2.5 text-[14.5px] font-semibold text-accent-fg transition hover:brightness-95">Sign in with GitHub</button>
  );
}
