"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { loginOf, signInWithGitHub, signOut, supabase } from "@/lib/supabase";
import { GitHubMark } from "./GitHubMark";

/**
 * The signed-in GitHub session, once Supabase has looked: undefined while it is looking, null when nobody is signed in.
 * `problem` says why a sign-in that just ended did not work (Supabase sends the reason back in the address), in words.
 */
export function useGitHubSession(): { session: Session | null | undefined; login: string | null; problem: string | null } {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let off: (() => void) | undefined;
    let dead = false;
    // coming back from GitHub, the address carries either ?code=... (it worked) or an error with its reason, in the query or after the #
    const url = new URL(location.href);
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const reason = url.searchParams.get("error_description") ?? hash.get("error_description");
    const cameBack = url.searchParams.has("code");
    if (reason) { setProblem(reason.replace(/\+/g, " ")); history.replaceState(null, "", location.pathname); }
    void supabase().then((sb) => {
      if (dead) return;
      void sb.auth.getSession().then(({ data }) => {
        if (dead) return;
        setSession(data.session);
        if (cameBack && !data.session) setProblem("The sign-in did not finish. Start it again from this page, on the same address you started from.");
      });
      const { data } = sb.auth.onAuthStateChange((_event, s) => setSession(s));
      off = () => data.subscription.unsubscribe();
    });
    return () => { dead = true; off?.(); };
  }, []);
  return { session, login: loginOf(session ?? null), problem };
}

const btn = "rounded-lg border border-line-strong px-4 py-2 text-[14px] font-semibold transition hover:bg-tint-2";

/** "Sign in with GitHub", or who is signed in and a way out. */
export function GitHubAccount({ login, loading, problem }: { login: string | null; loading: boolean; problem?: string | null }) {
  if (loading) return <p className="text-[14px] text-faint">Checking sign-in…</p>;
  return login ? (
    <p className="flex flex-wrap items-center gap-3 text-[14px] text-dim">Signed in as <strong className="text-fg">{login}</strong><button onClick={() => void signOut()} className={btn}>Sign out</button></p>
  ) : (
    <>
    {problem && <p role="alert" className="mb-3 max-w-[34rem] text-[14.5px] text-bad">Sign-in problem: {problem}</p>}
    <button onClick={() => void signInWithGitHub()} className="inline-flex items-center gap-2.5 rounded-lg border border-accent bg-accent px-5 py-2.5 text-[14.5px] font-semibold text-accent-fg transition hover:brightness-95"><GitHubMark size={18} /> Sign in with GitHub</button>
    </>
  );
}
