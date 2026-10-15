"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { hasKitRelease, parseRepo, repoChoices, statusText, submitError, type Status } from "@/lib/submit";
import { supabase } from "@/lib/supabase";
import { GitHubAccount, useGitHubSession } from "./GitHubAccount";

interface Mine { repo: string; status: Status; note: string | null }
type Release = "idle" | "checking" | "ok" | "none" | "unknown";

const field = "bg-field w-full rounded-lg border border-line-strong px-3 py-2.5 text-[15px] outline-none focus:border-accent";

/** The person's public repositories from GitHub, up to 300 of them. null while loading, "error" if GitHub wouldn't say (rate limit, offline). */
async function loadRepos(login: string): Promise<unknown[] | "error"> {
  const all: unknown[] = [];
  try {
    for (let page = 1; page <= 3; page++) {
      const res = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}/repos?type=owner&sort=pushed&per_page=100&page=${page}`, { headers: { accept: "application/vnd.github+json" } });
      if (!res.ok) return all.length ? all : "error";
      const rows = (await res.json()) as unknown[];
      all.push(...rows);
      if (rows.length < 100) break;
    }
  } catch { return all.length ? all : "error"; }
  return all;
}

export function SubmitKit() {
  const { session, login, problem } = useGitHubSession();
  const [all, setAll] = useState<unknown[] | "error" | null>(null);
  const [choice, setChoice] = useState("");
  const [release, setRelease] = useState<Release>("idle");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [mine, setMine] = useState<Mine[]>([]);

  const load = useCallback(async () => {
    if (!login) return;
    const { data } = await (await supabase()).from("kits").select("repo,status,note").eq("submitted_by", login).order("created_at", { ascending: false });
    setMine((data ?? []) as Mine[]);
  }, [login]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (login) { setAll(null); void loadRepos(login).then(setAll); } }, [login]);

  const choices = useMemo(() => (Array.isArray(all) ? repoChoices(all, mine.map((m) => m.repo)) : []), [all, mine]);
  const parsed = login && choice ? parseRepo(choice, login) : null;
  const repo = parsed && "repo" in parsed ? parsed.repo : "";

  // as soon as a repository is picked, look for a release that carries the kit file, so a repository with nothing to install is caught here
  useEffect(() => {
    if (!repo) { setRelease("idle"); return; }
    let stale = false;
    setRelease("checking");
    void fetch(`https://api.github.com/repos/${repo}/releases?per_page=10`, { headers: { accept: "application/vnd.github+json" } })
      .then(async (res) => (res.ok ? hasKitRelease(await res.json()) : null))
      .then((has) => { if (!stale) setRelease(has === true ? "ok" : has === false ? "none" : "unknown"); })
      .catch(() => { if (!stale) setRelease("unknown"); });
    return () => { stale = true; };
  }, [repo]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!login) return;
    const p = parseRepo(choice, login);
    if ("error" in p) { setMessage({ ok: false, text: p.error }); return; }
    setBusy(true); setMessage(null);
    try {
      const { error } = await (await supabase()).from("kits").insert({ repo: p.repo, submitted_by: login });
      if (error) { setMessage({ ok: false, text: submitError(error) }); return; }
      setMessage({ ok: true, text: `${p.repo} was submitted. A maintainer reviews every new kit, and the status shows below.` });
      setChoice("");
      await load();
    } finally { setBusy(false); }
  }

  async function withdraw(r: string) {
    if (!window.confirm(`Withdraw ${r}? It is removed from the registry (and from the Kits screen, within the hour).`)) return;
    const { error } = await (await supabase()).from("kits").delete().eq("repo", r);
    setMessage(error ? { ok: false, text: submitError(error) } : { ok: true, text: `${r} was withdrawn.` });
    await load();
  }

  const hint = release === "checking" ? "Looking for a release with jimkit-kit.json…"
    : release === "ok" ? "This repository has a release with jimkit-kit.json."
    : release === "none" ? "This repository has no release with a jimkit-kit.json file attached yet. Publish one first."
    : release === "unknown" ? "GitHub didn't say whether this has a release. You can still submit it; the registry checks again." : "";

  return (
    <div className="mt-8 max-w-[34rem]">
      <GitHubAccount login={login} loading={session === undefined} problem={problem} />
      {session === null && <p className="mt-4 text-[14.5px] text-dim">Signing in tells the registry which GitHub account you are, so you can submit your own kits.</p>}
      {session && !login && <p className="mt-4 text-[14.5px] text-dim">This sign-in isn&apos;t a GitHub account. Sign out and sign in with GitHub.</p>}
      {login && (
        <form onSubmit={submit} className="mt-6">
          <label className="block text-[13px] font-semibold uppercase tracking-[0.1em] text-faint" htmlFor="repo">Repository</label>
          <div className="mt-2 flex gap-2">
            {all === "error" ? (
              <input id="repo" value={choice} onChange={(e) => setChoice(e.target.value)} placeholder={`${login}/your-kit`} spellCheck={false} autoComplete="off" className={field} />
            ) : (
              <select id="repo" value={choice} onChange={(e) => setChoice(e.target.value)} disabled={all === null} className={field}>
                <option value="">{all === null ? "Loading your repositories…" : choices.length ? "Choose one of your public repositories" : "You have no public repositories to submit"}</option>
                {choices.map((c) => <option key={c.repo} value={c.repo}>{c.name}{c.fork ? " (fork)" : ""}{c.description ? `: ${c.description}` : ""}</option>)}
              </select>
            )}
            <button type="submit" disabled={busy || !repo || release === "none"} className="shrink-0 rounded-lg border border-accent bg-accent px-5 py-2.5 text-[14.5px] font-semibold text-accent-fg transition hover:brightness-95 disabled:opacity-50">{busy ? "Submitting…" : "Submit"}</button>
          </div>
          {all === "error" && <p className="mt-2 text-[13.5px] text-dim">GitHub wouldn&apos;t list your repositories just now (it limits how often a page may ask). Type the name instead.</p>}
          {hint && <p className={`mt-2 text-[13.5px] ${release === "none" ? "text-bad" : release === "ok" ? "text-ok" : "text-dim"}`}>{hint}</p>}
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
