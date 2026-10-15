"use client";

import { useCallback, useEffect, useState } from "react";
import { groupKits, hasKitRelease, statusText, type AdminKit, type Status } from "@/lib/submit";
import { supabase } from "@/lib/supabase";
import { GitHubAccount, useGitHubSession } from "./GitHubAccount";

interface ReviewRow { id: string; repo: string; reviewer: string; rating: number; body: string; created_at: string }

const btn = "rounded-lg border border-line-strong px-3 py-1.5 text-[13px] transition hover:bg-tint-2 disabled:opacity-50";
const primary = "rounded-lg border border-accent bg-accent px-3 py-1.5 text-[13px] font-semibold text-accent-fg transition hover:brightness-95 disabled:opacity-50";
const field = "bg-field rounded-lg border border-line-strong px-3 py-2 text-[14px] outline-none focus:border-accent";

/** What GitHub says about a repository's releases, so the person approving can see there is something to approve. */
function ReleaseLine({ repo }: { repo: string }) {
  const [text, setText] = useState("Checking the releases…");
  useEffect(() => {
    let stale = false;
    void fetch(`https://api.github.com/repos/${repo}/releases?per_page=10`, { headers: { accept: "application/vnd.github+json" } })
      .then(async (r) => (r.ok ? ((await r.json()) as { tag_name?: string; assets?: { name?: string }[] }[]) : null))
      .then((rel) => {
        if (stale) return;
        if (!rel) setText("GitHub didn't say (rate limit, or the repository is private or gone).");
        else {
          const kit = rel.find((x) => hasKitRelease([x]));
          setText(kit ? `Latest kit release: ${kit.tag_name}.` : "No release carries jimkit-kit.json.");
        }
      })
      .catch(() => { if (!stale) setText("GitHub didn't answer."); });
    return () => { stale = true; };
  }, [repo]);
  return <span>{text}</span>;
}

export function AdminKits() {
  const { session, login, problem } = useGitHubSession();
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [kits, setKits] = useState<AdminKit[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const sb = await supabase();
    const k = await sb.from("kits").select("repo,submitted_by,status,note,created_at").order("created_at", { ascending: false });
    setKits((k.data ?? []) as AdminKit[]);
    const r = await sb.from("reviews").select("id,repo,reviewer,rating,body,created_at").order("created_at", { ascending: false }).limit(50);
    setReviews((r.data ?? []) as ReviewRow[]);
  }, []);

  // whether this is an admin is the database's answer: the page shows nothing until it says yes
  useEffect(() => {
    if (!login) { setAdmin(null); return; }
    void supabase().then((sb) => sb.rpc("is_admin")).then(({ data, error }) => setAdmin(!error && data === true));
  }, [login]);
  useEffect(() => { if (admin) void load(); }, [admin, load]);

  async function run(label: string, job: () => PromiseLike<{ error: { message: string } | null }>, done: string) {
    setBusy(label); setMessage(null);
    const { error } = await job();
    setBusy("");
    setMessage(error ? { ok: false, text: `Didn't work: ${error.message}` } : { ok: true, text: done });
    await load();
  }
  const decide = async (repo: string, status: Status) => run(`${status}:${repo}`, async () => (await supabase()).from("kits").update({ status, note: (notes[repo] ?? "").trim() || null }).eq("repo", repo), `${repo}: ${statusText(status).toLowerCase()}.`);
  const remove = async (repo: string) => { if (window.confirm(`Delete ${repo} and its reviews?`)) await run(`delete:${repo}`, async () => (await supabase()).from("kits").delete().eq("repo", repo), `${repo} was deleted.`); };
  const removeReview = async (r: ReviewRow) => { if (window.confirm(`Delete ${r.reviewer}'s review of ${r.repo}?`)) await run(`review:${r.id}`, async () => (await supabase()).from("reviews").delete().eq("id", r.id), "The review was deleted."); };
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const repo = adding.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\.git$/i, "").replace(/\/+$/, "").toLowerCase();
    if (!/^[a-z0-9-]{1,39}\/[a-z0-9._-]{1,100}$/.test(repo)) { setMessage({ ok: false, text: "That should look like owner/repository." }); return; }
    await run(`add:${repo}`, async () => (await supabase()).from("kits").insert({ repo, submitted_by: repo.split("/")[0], status: "approved" }), `${repo} was added and approved.`);
    setAdding("");
  }

  const groups = groupKits(kits);
  const row = (k: AdminKit) => (
    <li key={k.repo} className="px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p><a href={`https://github.com/${k.repo}`} rel="noopener" className="font-mono text-[14px] hover:underline">{k.repo}</a> <span className="text-[13px] text-faint">by {k.submitted_by} · {k.created_at.slice(0, 10)}</span></p>
        <p className="text-[13px] text-dim">{statusText(k.status)}</p>
      </div>
      {k.status === "pending" && <p className="mt-1 text-[13px] text-dim"><ReleaseLine repo={k.repo} /> <a href={`https://github.com/${k.repo}/releases`} rel="noopener" className="underline">Releases</a> · <a href={`https://github.com/${k.repo}`} rel="noopener" className="underline">Code</a></p>}
      {k.note && <p className="mt-1 text-[13px] text-dim">Note: {k.note}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {k.status !== "approved" && <button disabled={!!busy} onClick={() => void decide(k.repo, "approved")} className={primary}>Approve</button>}
        {k.status !== "rejected" && <button disabled={!!busy} onClick={() => void decide(k.repo, "rejected")} className={btn}>Reject</button>}
        <input value={notes[k.repo] ?? ""} onChange={(e) => setNotes({ ...notes, [k.repo]: e.target.value })} placeholder="Note to the author (optional)" maxLength={500} className={`${field} min-w-[12rem] flex-1`} aria-label={`Note for ${k.repo}`} />
        <button disabled={!!busy} onClick={() => void remove(k.repo)} className={btn}>Delete</button>
      </div>
    </li>
  );
  const section = (title: string, list: AdminKit[], empty: string) => (
    <section className="mt-8">
      <h2 className="font-display text-[1.5rem]">{title} <span className="text-[1rem] text-faint">{list.length}</span></h2>
      {list.length ? <ul className="mt-3 divide-y divide-line rounded-xl border border-line">{list.map(row)}</ul> : <p className="mt-2 text-[14.5px] text-dim">{empty}</p>}
    </section>
  );

  return (
    <div className="mt-8 max-w-[52rem]">
      <GitHubAccount login={login} loading={session === undefined} problem={problem} />
      {login && admin === null && <p className="mt-4 text-[14.5px] text-faint">Checking…</p>}
      {login && admin === false && <p className="mt-4 text-[14.5px] text-dim">{login} is not an admin of this registry.</p>}
      {admin && (
        <>
          {message && <p role="status" className={`mt-4 text-[14.5px] ${message.ok ? "text-ok" : "text-bad"}`}>{message.text}</p>}
          {section("Waiting for approval", groups.pending, "Nothing is waiting.")}
          {section("Approved", groups.approved, "No kit is listed yet.")}
          {section("Not approved", groups.rejected, "None.")}
          <p className="mt-4 text-[13.5px] text-dim">An approved kit shows in Jimkit&apos;s Kits screen with the next hourly index run, and on the website after its next build.</p>

          <section className="mt-10">
            <h2 className="font-display text-[1.5rem]">Add a kit</h2>
            <p className="mt-2 text-[14px] text-dim">For a kit owned by an organisation, or anyone who can&apos;t submit it themselves. It is approved at once.</p>
            <form onSubmit={add} className="mt-3 flex max-w-[34rem] gap-2">
              <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="owner/repository" spellCheck={false} className={`${field} flex-1`} aria-label="Repository to add" />
              <button type="submit" disabled={!!busy || !adding.trim()} className={primary}>Add</button>
            </form>
          </section>

          <section className="mt-10">
            <h2 className="font-display text-[1.5rem]">Latest reviews <span className="text-[1rem] text-faint">{reviews.length}</span></h2>
            {reviews.length ? (
              <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
                {reviews.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0"><p className="text-[14px]"><strong>{r.reviewer}</strong> on <span className="font-mono">{r.repo}</span> · {r.rating}/5 · {r.created_at.slice(0, 10)}</p>{r.body && <p className="text-[13.5px] text-dim">{r.body}</p>}</div>
                    <button disabled={!!busy} onClick={() => void removeReview(r)} className={btn}>Delete</button>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-[14.5px] text-dim">No reviews yet.</p>}
          </section>
        </>
      )}
    </div>
  );
}
