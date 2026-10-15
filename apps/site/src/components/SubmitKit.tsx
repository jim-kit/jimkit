"use client";

import { useCallback, useEffect, useState } from "react";
import { hasKitRelease, parseRepo, statusText, submitError, type Status } from "@/lib/submit";
import { supabase } from "@/lib/supabase";
import { GitHubAccount, useGitHubSession } from "./GitHubAccount";

interface Mine { repo: string; status: Status; note: string | null }

const field = "bg-field w-full rounded-lg border border-line-strong px-3 py-2.5 text-[15px] outline-none focus:border-accent";

export function SubmitKit() {
  const { session, login } = useGitHubSession();
  const [repo, setRepo] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [mine, setMine] = useState<Mine[]>([]);

  const load = useCallback(async () => {
    if (!login) return;
    const { data } = await (await supabase()).from("kits").select("repo,status,note").eq("submitted_by", login).order("created_at", { ascending: false });
    setMine((data ?? []) as Mine[]);
  }, [login]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (login && !repo) setRepo(`${login}/`); }, [login, repo]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!login) return;
    const parsed = parseRepo(repo, login);
    if ("error" in parsed) { setMessage({ ok: false, text: parsed.error }); return; }
    setBusy(true); setMessage(null);
    try {
      // a quick look at GitHub first, so a repository with nothing to install is caught here, not after a maintainer has looked at it
      try {
        const res = await fetch(`https://api.github.com/repos/${parsed.repo}/releases?per_page=10`, { headers: { accept: "application/vnd.github+json" } });
        if (res.status === 404) { setMessage({ ok: false, text: `GitHub has no repository ${parsed.repo}, or it is private.` }); return; }
        if (res.ok && hasKitRelease(await res.json()) === false) { setMessage({ ok: false, text: "That repository has no release with a jimkit-kit.json file attached yet. Publish one first." }); return; }
      } catch { /* GitHub unreachable or rate limited: the index checks the release again anyway */ }
      const { error } = await (await supabase()).from("kits").insert({ repo: parsed.repo, submitted_by: login });
      if (error) { setMessage({ ok: false, text: submitError(error) }); return; }
      setMessage({ ok: true, text: `${parsed.repo} was submitted. A maintainer reviews every new kit, and the status shows below.` });
      setRepo(`${login}/`);
      await load();
    } finally { setBusy(false); }
  }

  async function withdraw(r: string) {
    if (!window.confirm(`Withdraw ${r}? It is removed from the registry (and from the Kits screen, within the hour).`)) return;
    const { error } = await (await supabase()).from("kits").delete().eq("repo", r);
    setMessage(error ? { ok: false, text: submitError(error) } : { ok: true, text: `${r} was withdrawn.` });
    await load();
  }

  return (
    <div className="mt-8 max-w-[34rem]">
      <GitHubAccount login={login} loading={session === undefined} />
      {session === null && <p className="mt-4 text-[14.5px] text-dim">Signing in tells the registry which GitHub account you are, so you can submit your own kits.</p>}
      {session && !login && <p className="mt-4 text-[14.5px] text-dim">This sign-in isn&apos;t a GitHub account. Sign out and sign in with GitHub.</p>}
      {login && (
        <form onSubmit={submit} className="mt-6">
          <label className="block text-[13px] font-semibold uppercase tracking-[0.1em] text-faint" htmlFor="repo">Repository</label>
          <div className="mt-2 flex gap-2">
            <input id="repo" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder={`${login}/your-kit`} spellCheck={false} autoComplete="off" className={field} />
            <button type="submit" disabled={busy} className="shrink-0 rounded-lg border border-accent bg-accent px-5 py-2.5 text-[14.5px] font-semibold text-accent-fg transition hover:brightness-95 disabled:opacity-60">{busy ? "Submitting…" : "Submit"}</button>
          </div>
        </form>
      )}
      {message && <p role="status" className={`mt-4 text-[14.5px] ${message.ok ? "text-ok" : "text-bad"}`}>{message.text}</p>}
      {mine.length > 0 && (
        <div className="mt-10">
          <h2 className="font-display text-[1.5rem]">Your kits</h2>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
            {mine.map((k) => (
              <li key={k.repo} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-[14px]">{k.repo}</p>
                  <p className="text-[13.5px] text-dim">{statusText(k.status)}{k.note ? `: ${k.note}` : ""}</p>
                </div>
                <button onClick={() => void withdraw(k.repo)} className="rounded-lg border border-line-strong px-3 py-1.5 text-[13px] transition hover:bg-tint-2">Withdraw</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
