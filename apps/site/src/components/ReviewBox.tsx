"use client";

import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { GitHubAccount, useGitHubSession } from "./GitHubAccount";

const field = "bg-field w-full rounded-lg border border-line-strong px-3 py-2.5 text-[15px] outline-none focus:border-accent";

/** Write, change or delete your own review of a kit. The database allows one per person, never of your own kit. */
export function ReviewBox({ repo, versions }: { repo: string; versions: string[] }) {
  const { session, login, problem } = useGitHubSession();
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [version, setVersion] = useState("");
  const [had, setHad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const owner = repo.split("/")[0];

  useEffect(() => {
    if (!login) return;
    void supabase().then((sb) => sb.from("reviews").select("rating,body,version").eq("repo", repo).eq("reviewer", login).maybeSingle()).then(({ data }) => {
      if (data) { setHad(true); setRating(data.rating); setBody(data.body ?? ""); setVersion(data.version ?? ""); }
    });
  }, [login, repo]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!login) return;
    setBusy(true); setMessage(null);
    const sb = await supabase();
    const row = { rating, body: body.trim(), version: version || null };
    const { error } = had ? await sb.from("reviews").update(row).eq("repo", repo).eq("reviewer", login) : await sb.from("reviews").insert({ ...row, repo, reviewer: login });
    setBusy(false);
    if (error) { setMessage({ ok: false, text: /row-level security|42501/i.test(`${error.code} ${error.message}`) ? "The registry didn't accept that review. A kit can't be reviewed by its own author, and only listed kits can be reviewed." : "Something went wrong. Try again in a moment." }); return; }
    setHad(true);
    setMessage({ ok: true, text: "Saved. It shows on this page after the next update, within the hour." });
  }

  async function remove() {
    if (!login || !window.confirm("Delete your review?")) return;
    const { error } = await (await supabase()).from("reviews").delete().eq("repo", repo).eq("reviewer", login);
    if (!error) { setHad(false); setBody(""); setVersion(""); setRating(5); }
    setMessage(error ? { ok: false, text: "Something went wrong. Try again in a moment." } : { ok: true, text: "Your review was deleted." });
  }

  return (
    <div id="review" className="mt-6 max-w-[34rem] scroll-mt-24">
      <GitHubAccount login={login} loading={session === undefined} problem={problem} />
      {login && login === owner && <p className="mt-4 text-[14.5px] text-dim">You can&apos;t review your own kit.</p>}
      {login && login !== owner && (
        <form onSubmit={save} className="mt-5">
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((i) => (
              <button type="button" key={i} role="radio" aria-checked={rating === i} aria-label={`${i} out of 5`} onClick={() => setRating(i)} className="rounded p-0.5 text-warn"><Star size={24} fill={i <= rating ? "currentColor" : "none"} strokeWidth={1.6} /></button>
            ))}
          </div>
          <textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 600))} rows={3} placeholder="A few words (optional)" aria-label="Your review" className={`${field} mt-3 resize-none`} />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select value={version} onChange={(e) => setVersion(e.target.value)} aria-label="Version you used" className={`${field} w-auto`}>
              <option value="">Version (optional)</option>
              {versions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <button type="submit" disabled={busy} className="rounded-lg border border-accent bg-accent px-5 py-2.5 text-[14.5px] font-semibold text-accent-fg transition hover:brightness-95 disabled:opacity-60">{busy ? "Saving…" : had ? "Update review" : "Post review"}</button>
            {had && <button type="button" onClick={() => void remove()} className="rounded-lg border border-line-strong px-4 py-2.5 text-[14px] transition hover:bg-tint-2">Delete</button>}
          </div>
        </form>
      )}
      {message && <p role="status" className={`mt-4 text-[14.5px] ${message.ok ? "text-ok" : "text-bad"}`}>{message.text}</p>}
    </div>
  );
}
