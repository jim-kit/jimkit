"use client";

import type { AddonManifest, AddonStatus } from "@jimkit/sdk";
import { hasBuiltInIcon, Btn, Icon, Seg, toast, useDialogFocus, useOverlayEscape } from "@jimkit/ui";
import { ArrowLeft, ExternalLink, Server, ShieldAlert, ShieldCheck, Star, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InstalledView, Preview, RegistryKit, StoreView } from "@/core/store/types";
import { formatBytes, matchKits, reviewUrl, sourceFromQuery, updateFor } from "./kits-util";
import { useApp } from "./providers";
import { saveJson } from "./save";

/* ───────── talking to the server ───────── */

async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? "Something went wrong.");
  return data as T;
}

const toolIcon = (name: string) => (hasBuiltInIcon(name) ? name : "Puzzle");
const person = (repo: string) => repo.split("/")[0];

/* ───────── small pieces ───────── */

function Stars({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex gap-px text-warn" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} fill={i <= value + 0.25 ? "currentColor" : "none"} strokeWidth={1.6} />)}
    </span>
  );
}

function Rating({ kit }: { kit: RegistryKit }) {
  if (!kit.rating) return <span className="text-[12px] text-faint">No reviews yet</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-dim" title={`${kit.rating.average.toFixed(1)} out of 5`}>
      <Stars value={kit.rating.average} /> {kit.rating.average.toFixed(1)} <span className="text-faint">({kit.rating.count})</span>
    </span>
  );
}

function ToolChips({ tools }: { tools: { name: string; icon: string }[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {tools.slice(0, 4).map((t) => <span key={t.name} className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[11.5px] text-dim"><Icon name={toolIcon(t.icon)} size={12} />{t.name}</span>)}
      {tools.length > 4 && <span className="px-1 py-0.5 text-[11.5px] text-faint">+{tools.length - 4}</span>}
    </span>
  );
}

function ThemeChips({ themes }: { themes: { name: string }[] }) {
  return <span className="flex flex-wrap gap-1.5">{themes.map((t) => <span key={t.name} className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[11.5px] text-dim"><Icon name="Palette" size={12} />{t.name} theme</span>)}</span>;
}

const Row = ({ children }: { children: React.ReactNode }) => <li className="flex items-center gap-3 px-3.5 py-3">{children}</li>;
const Heading = ({ children }: { children: React.ReactNode }) => <h3 className="mb-2 mt-6 text-[11.5px] font-semibold uppercase tracking-[.14em] text-faint first:mt-0">{children}</h3>;

/* ───────── the look-before-you-install step ───────── */

const TRUST = {
  verified: { icon: ShieldCheck, tone: "text-ok", title: "Listed in the registry", text: "This is the exact file the registry recorded." },
  unrecorded: { icon: ShieldAlert, tone: "text-warn", title: "New since the registry looked", text: "The kit is listed, but this version hasn't been recorded yet." },
  unlisted: { icon: ShieldAlert, tone: "text-warn", title: "Not in the registry", text: "Nobody has vouched for this one. You are trusting its author." },
} as const;

function Review({ p, onCancel, onDone }: { p: Preview; onCancel(): void; onDone(next: Awaited<ReturnType<typeof install>>): void }) {
  const box = useRef<HTMLDivElement>(null);
  useOverlayEscape(true, onCancel);
  useDialogFocus(box, true);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const trust = TRUST[p.trust];
  const needsAck = p.trust !== "verified";
  const verb = p.change === "update" ? "Update" : p.change === "older" ? "Go back to this version" : p.change === "same" ? "Reinstall" : "Install";
  const go = async () => {
    setBusy(true);
    try { onDone(await install(p.sha256, ack)); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't install"); setBusy(false); }
  };
  return (
    <div className="jk-fade fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4" onMouseDown={(e) => { e.stopPropagation(); onCancel(); }}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Add ${p.name}`} className="jk-panel w-full max-w-[440px] rounded-2xl p-5 outline-none" onMouseDown={(e) => e.stopPropagation()}>
        <p className="text-[12px] text-faint">{p.change === "update" ? `Update from ${p.installed}` : p.change === "older" ? `Older than ${p.installed}, which is installed` : p.change === "same" ? "Already installed" : "Add this kit"}</p>
        <h2 className="mt-0.5 text-[18px] font-semibold">{p.name} <span className="text-[14px] font-normal text-faint">{p.version}</span></h2>
        <p className="mt-0.5 text-[12.5px] text-faint">{p.repo}{p.author ? ` · ${p.author}` : ""} · {formatBytes(p.bytes)}</p>
        <p className="mt-3 text-[14px] text-dim">{p.description}</p>
        <ul className="mt-3 space-y-1.5">
          {(p.themes ?? []).map((t) => <li key={t.name} className="flex items-start gap-2 text-[13px]"><span className="mt-0.5 text-dim"><Icon name="Palette" size={14} /></span><span><span className="font-medium">{t.name}</span> <span className="text-faint">a look: {t.blurb}</span></span></li>)}
          {p.tools.map((t) => <li key={t.name} className="flex items-start gap-2 text-[13px]"><span className="mt-0.5 text-dim"><Icon name={toolIcon(t.icon)} size={14} /></span><span><span className="font-medium">{t.name}</span> <span className="text-faint">{t.blurb}</span></span></li>)}
        </ul>

        <div className="mt-4 space-y-2 rounded-xl border border-line p-3 text-[12.5px] leading-relaxed text-dim">
          <p className="flex gap-2"><span className={`mt-0.5 shrink-0 ${trust.tone}`}><trust.icon size={15} /></span><span><span className="font-medium text-fg">{trust.title}.</span> {trust.text}</span></p>
          <p>{p.tools.length === 0 && p.themes.length > 0 && !p.server ? "It is a stylesheet: it changes how Jimkit looks and does nothing else." : "It runs in the browser, in the same page as your other tools."}</p>
          {p.server && <p className="flex gap-2"><span className="mt-0.5 shrink-0"><Server size={15} /></span><span>It also runs code on this server with Jimkit&apos;s own permissions: it can read the data folder and the settings, and use the network.</span></p>}
          {p.apt.length > 0 && <p>It expects these programs on the machine: <span className="font-mono text-[12px]">{p.apt.join(" ")}</span>. A kit can&apos;t install them; the tool says so if they&apos;re missing.</p>}
        </div>

        {p.conflict ? (
          <p className="mt-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-[13px]">{p.conflict} Remove that one first, or ask the author to rename.</p>
        ) : needsAck ? (
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[13px]">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 size-[17px] shrink-0 accent-[var(--accent)]" />
            <span>I trust <span className="font-medium">{person(p.repo)}</span> to run code here.</span>
          </label>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Btn onClick={onCancel}>Cancel</Btn>
          <Btn primary disabled={busy || !!p.conflict || (needsAck && !ack)} onClick={() => void go()}>{busy ? "Working…" : verb}</Btn>
        </div>
      </div>
    </div>
  );
}

async function install(sha256: string, acknowledged: boolean) {
  return call<{ id: string; warning?: string; manifests: AddonManifest[]; status: Record<string, AddonStatus>; addonSettings: Record<string, Record<string, unknown>>; store: StoreView }>("/api/store/install", { sha256, acknowledged });
}

/* ───────── writing a review ───────── */

function ReviewForm({ kit, registry, installed, onClose }: { kit: RegistryKit; registry: string; installed?: string; onClose(): void }) {
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [me, setMe] = useState(() => { try { return localStorage.getItem("jk.ghuser") ?? ""; } catch { return ""; } });
  const url = reviewUrl(registry, kit.repo, me.trim(), { rating, text, version: installed });
  return (
    <div className="mt-3 rounded-xl border border-line p-3">
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} role="radio" aria-checked={rating === i} aria-label={`${i} out of 5`} onClick={() => setRating(i)} className="rounded p-0.5 text-warn"><Star size={20} fill={i <= rating ? "currentColor" : "none"} strokeWidth={1.6} /></button>
        ))}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 600))} rows={3} placeholder="What it is good for, what it isn't (optional)" aria-label="Your review"
        className="mt-2 w-full resize-none rounded-lg border border-line-strong bg-field px-2.5 py-2 text-[13.5px] outline-none focus:border-accent" />
      <input value={me} onChange={(e) => { setMe(e.target.value); try { localStorage.setItem("jk.ghuser", e.target.value.trim()); } catch { /* ignore */ } }} placeholder="Your GitHub username" aria-label="Your GitHub username" spellCheck={false}
        className="mt-2 w-full rounded-lg border border-line-strong bg-field px-2.5 py-1.5 text-[13.5px] outline-none focus:border-accent" />
      <p className="mt-2 text-[12px] leading-relaxed text-faint">Reviews live in the registry&apos;s repository, under your GitHub name. This opens GitHub with the file filled in; you propose it from there.</p>
      <div className="mt-2 flex justify-end gap-2">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn primary disabled={!url} onClick={() => { if (url) { window.open(url, "_blank", "noopener"); onClose(); } }}><ExternalLink size={14} /> Continue on GitHub</Btn>
      </div>
    </div>
  );
}

/* ───────── one kit in the registry ───────── */

function Detail({ kit, store, installed, onBack, onLook }: { kit: RegistryKit; store: StoreView; installed?: InstalledView; onBack(): void; onLook(source: string, version?: string): void }) {
  const [writing, setWriting] = useState(false);
  const update = installed ? updateFor(installed, store.registry.kits) : null;
  return (
    <div>
      <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-[13px] text-dim hover:text-fg"><ArrowLeft size={15} /> All kits</button>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[18px] font-semibold">{kit.name}</h3>
          <p className="text-[12.5px] text-faint"><a className="underline underline-offset-2 hover:text-fg" href={`https://github.com/${kit.repo}`} target="_blank" rel="noopener noreferrer">{kit.repo}</a>{kit.author ? ` · ${kit.author}` : ""}</p>
        </div>
        {installed ? (update ? <Btn primary onClick={() => onLook(kit.repo, update)}>Update to {update}</Btn> : <span className="mt-1 text-[12.5px] text-ok">Installed {installed.version}</span>) : <Btn primary onClick={() => onLook(kit.repo)}>Install {kit.latest}</Btn>}
      </div>
      <p className="mt-3 text-[14px] text-dim">{kit.description}</p>
      <div className="mt-3">{kit.tools.length ? <ToolChips tools={kit.tools} /> : <ThemeChips themes={kit.themes ?? []} />}</div>

      <Heading>Versions</Heading>
      <ul className="divide-y divide-line rounded-xl border border-line text-[13px]">
        {kit.versions.slice(0, 8).map((v) => (
          <Row key={v.version}>
            <span className="min-w-0 flex-1"><span className="font-medium">{v.version}</span> <span className="text-faint">{v.date.slice(0, 10)} · {formatBytes(v.size)}{v.server ? " · server part" : ""}</span></span>
            {installed?.version === v.version ? <span className="text-[12px] text-faint">Installed</span> : <Btn onClick={() => onLook(kit.repo, v.version)}>{installed ? "Use this" : "Install"}</Btn>}
          </Row>
        ))}
      </ul>

      <Heading>Reviews</Heading>
      <div className="flex items-center justify-between gap-2">
        <Rating kit={kit} />
        {store.registry.repo && !writing && <Btn onClick={() => setWriting(true)}>Write a review</Btn>}
      </div>
      {writing && store.registry.repo && <ReviewForm kit={kit} registry={store.registry.repo} installed={installed?.version} onClose={() => setWriting(false)} />}
      {kit.reviews.length > 0 && (
        <ul className="mt-3 space-y-3">
          {kit.reviews.slice(0, 8).map((r) => (
            <li key={r.user} className="text-[13px]">
              <p className="flex items-center gap-2"><Stars value={r.rating} /><a className="font-medium underline-offset-2 hover:underline" href={`https://github.com/${r.user}`} target="_blank" rel="noopener noreferrer">{r.user}</a><span className="text-faint">{r.version ? `on ${r.version} · ` : ""}{r.date.slice(0, 10)}</span></p>
              {r.text && <p className="mt-0.5 text-dim">{r.text}</p>}
            </li>
          ))}
        </ul>
      )}
      {kit.homepage && <p className="mt-5 text-[12.5px]"><a className="text-dim underline underline-offset-2 hover:text-fg" href={kit.homepage} target="_blank" rel="noopener noreferrer">{kit.homepage.replace(/^https?:\/\//, "")}</a></p>}
    </div>
  );
}

/* ───────── the screen ───────── */

export function Kits() {
  const { kitsOpen, setKitsOpen, applyKits, openTool, setTheme, session } = useApp();
  const [store, setStore] = useState<StoreView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"browse" | "installed">("browse");
  const [open, setOpen] = useState<string | null>(null);
  const [review, setReview] = useState<Preview | null>(null);
  const [looking, setLooking] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  // the newest list, for a handler that awaits: two quick switches must build on each other, not on what each saw when it started
  const storeRef = useRef(store);
  storeRef.current = store;
  const panel = useRef<HTMLElement>(null);
  const locked = !!store?.locked;

  const refresh = useCallback(async (force = false) => {
    try { setStore(await call<StoreView>(`/api/store${force ? "?refresh=1" : ""}`)); setError(null); } catch (e) { setError(e instanceof Error ? e.message : "Couldn't load"); }
  }, []);
  useEffect(() => { if (kitsOpen && session.tier === "trusted") void refresh(); }, [kitsOpen, session.tier, refresh]);
  // the review dialog is above the screen and has its own Escape, so the screen's waits for it to go
  useOverlayEscape(kitsOpen && !review, () => setKitsOpen(false));
  useDialogFocus(panel, kitsOpen);

  const kits = store?.registry.kits ?? [];
  const shown = useMemo(() => matchKits(kits, query), [kits, query]);
  const typed = sourceFromQuery(query);
  const detail = open ? kits.find((k) => k.repo === open) : undefined;
  const installedBy = (repo: string) => store?.kits.find((k) => k.repo === repo);

  if (!kitsOpen) return null;

  const look = async (source: string, version?: string) => {
    setLooking(true);
    try { setReview(await call<Preview>("/api/store/inspect", { source, version })); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't look at that"); }
    setLooking(false);
  };
  const done = (r: Awaited<ReturnType<typeof install>>) => {
    applyKits({ manifests: r.manifests, status: r.status, addonSettings: r.addonSettings });
    setStore(r.store);
    const added = r.store.kits.find((k) => k.id === r.id);
    setReview(null);
    setQuery("");
    setTab("installed");
    setOpen(null);
    const manifest = r.manifests.find((m) => m.id === r.id);
    const first = manifest?.tools.find((t) => t.status !== "soon");
    const look = !first ? manifest?.themes?.[0] : undefined;
    toast.success(added ? `${added.name} ${added.version} is installed` : "Installed", {
      description: r.warning ?? (look ? "Use it from Settings, under Look." : "Its tools are on the home screen."),
      action: first ? { label: "Open", onClick: () => { setKitsOpen(false); openTool(first.id); } }
        : look ? { label: "Use it", onClick: () => { setKitsOpen(false); void setTheme(look.id); } } : undefined,
    });
  };
  const remove = async (k: InstalledView) => {
    try {
      const r = await call<{ manifests: AddonManifest[]; status: Record<string, AddonStatus>; addonSettings: Record<string, Record<string, unknown>>; store: StoreView }>("/api/store/remove", { id: k.id });
      applyKits({ manifests: r.manifests, status: r.status, addonSettings: r.addonSettings });
      setStore(r.store);
      toast(`${k.name} removed`, { description: "Add it again any time." });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't remove"); }
    setRemoving(null);
  };
  const toggle = async (id: string, enabled: boolean) => {
    const store = storeRef.current;
    if (!store) return;
    const off = [...store.builtIn, ...store.kits].filter((m) => !m.enabled).map((m) => m.id).filter((x) => x !== id);
    if (!enabled) off.push(id);
    const data = await saveJson({ disabledAddons: off });
    if (!data) return;
    applyKits({ manifests: data.manifests as never, status: data.status as never, addonSettings: data.addonSettings as never });
    setStore((cur) => (cur ? { ...cur, builtIn: cur.builtIn.map((m) => (m.id === id ? { ...m, enabled } : m)), kits: cur.kits.map((m) => (m.id === id ? { ...m, enabled } : m)) } : cur));
  };

  return (
    <div className="jk-fade fixed inset-0 z-[68] flex justify-end bg-black/55" onMouseDown={() => setKitsOpen(false)}>
      <aside ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Kits" className="jk-panel jk-slide flex h-full w-full max-w-[520px] flex-col border-y-0 border-r-0 outline-none" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex shrink-0 items-center justify-between border-b border-line px-5 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
          <div>
            <h2 className="text-[17px] font-semibold">Kits</h2>
            <p className="text-[12px] text-faint">Kits add tools. Installing one takes effect straight away.</p>
          </div>
          <button onClick={() => setKitsOpen(false)} aria-label="Close" className="grid size-8 place-items-center rounded-lg text-faint hover:bg-tint-2 hover:text-fg"><X size={17} /></button>
        </header>

        {session.tier !== "trusted" ? (
          <p className="px-5 py-6 text-[14px] text-dim">Kits can only be added or removed from your own network.</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 scroll-hide">
            {error && <p className="mb-4 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-[13px]">{error}</p>}

            {!detail && (
              <>
                {locked && <p className="mb-4 rounded-lg border border-line px-3 py-2 text-[13px] text-dim">Adding and removing kits is switched off on this install (JIMKIT_KITS=off). You can still switch built-in kits on and off.</p>}
                <form onSubmit={(e) => { e.preventDefault(); if (typed && !locked) void look(typed); }} className={locked ? "hidden" : "flex gap-2"}>
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search, or paste user/name or a GitHub link" aria-label="Search kits or paste a GitHub link" spellCheck={false}
                    className="min-w-0 flex-1 rounded-xl border border-line-strong bg-field px-3 py-2 text-[14px] outline-none focus:border-accent" />
                  {typed && <Btn primary type="submit" disabled={looking}>{looking ? "Looking…" : "Add"}</Btn>}
                </form>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <Seg<"browse" | "installed"> label="Show" value={locked ? "installed" : tab} onChange={setTab} options={locked ? [{ id: "installed", label: "Installed" }] : [{ id: "browse", label: "Browse" }, { id: "installed", label: `Installed${store?.kits.length ? ` (${store.kits.length})` : ""}` }]} />
                  {tab === "browse" && <button onClick={() => void refresh(true)} className="text-[12.5px] text-faint underline-offset-2 hover:text-fg hover:underline">Refresh</button>}
                </div>
              </>
            )}

            {detail && store && <Detail kit={detail} store={store} installed={installedBy(detail.repo)} onBack={() => setOpen(null)} onLook={(s, v) => void look(s, v)} />}

            {!detail && !locked && tab === "browse" && store && (
              <div className="mt-4">
                {!store.registry.ok && <p className="mb-3 text-[13px] text-dim">{store.registry.error}</p>}
                {store.registry.stale && <p className="mb-3 text-[12.5px] text-faint">GitHub couldn&apos;t be reached, so this is the list from earlier.</p>}
                {store.registry.ok && shown.length === 0 && <p className="text-[13.5px] text-dim">{query ? "Nothing matches. If you know where a kit lives, paste its GitHub link above." : "The registry has no kits yet."}</p>}
                <ul className="space-y-2.5">
                  {shown.map((k) => {
                    const mine = installedBy(k.repo);
                    const update = mine ? updateFor(mine, kits) : null;
                    return (
                      <li key={k.repo}>
                        <button onClick={() => setOpen(k.repo)} className="block w-full rounded-xl border border-line p-3.5 text-left transition hover:border-line-strong hover:bg-tint">
                          <span className="flex items-start gap-3">
                            <span className="min-w-0 flex-1">
                              <span className="block text-[14.5px] font-medium">{k.name} <span className="font-normal text-faint">{k.latest}</span></span>
                              <span className="block text-[12px] text-faint">{k.repo}</span>
                            </span>
                            {mine ? <span className={`mt-0.5 text-[12px] ${update ? "text-warn" : "text-ok"}`}>{update ? `Update ${update}` : "Installed"}</span> : null}
                          </span>
                          <span className="mt-1.5 block text-[13px] text-dim">{k.description}</span>
                          <span className="mt-2 flex flex-wrap items-center justify-between gap-2">{k.tools.length ? <ToolChips tools={k.tools} /> : <ThemeChips themes={k.themes ?? []} />}<Rating kit={k} /></span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {!detail && (locked || tab === "installed") && store && (
              <div className="mt-4">
                <Heading>Added from GitHub</Heading>
                {store.kits.length === 0 ? <p className="text-[13.5px] text-dim">Nothing yet. Browse the registry, or paste a GitHub link in the box above.</p> : (
                  <ul className="divide-y divide-line rounded-xl border border-line">
                    {store.kits.map((k) => {
                      const update = updateFor(k, kits);
                      return (
                        <Row key={k.id}>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[14px] font-medium">{k.name} <span className="font-normal text-faint">{k.version}</span>{k.themes.length > 0 && <span className="ml-2 rounded-md border border-line px-1.5 py-0.5 text-[11px] font-normal text-dim">Theme</span>}</span>
                            <a className="block truncate text-[12px] text-faint underline-offset-2 hover:text-fg hover:underline" href={`https://github.com/${k.repo}`} target="_blank" rel="noopener noreferrer">{k.repo}</a>
                          </span>
                          {update && <Btn primary onClick={() => void look(k.repo, update)}>Update to {update}</Btn>}
                          <input type="checkbox" checked={k.enabled} onChange={(e) => void toggle(k.id, e.target.checked)} aria-label={`${k.name} on`} title={k.enabled ? "On: switch off to keep it installed but unused" : "Off"} className="size-[18px] shrink-0 cursor-pointer accent-[var(--accent)]" />
                          {locked ? null : removing === k.id ? (
                            <span className="flex items-center gap-1.5"><Btn onClick={() => setRemoving(null)}>Keep</Btn><Btn onClick={() => void remove(k)}>Remove</Btn></span>
                          ) : <Btn onClick={() => setRemoving(k.id)}>Remove</Btn>}
                        </Row>
                      );
                    })}
                  </ul>
                )}
                <Heading>Built in</Heading>
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {store.builtIn.map((m) => (
                    <li key={m.id}><label className="flex cursor-pointer items-center gap-3 px-3.5 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-medium">{m.name} <span className="font-normal text-faint">{m.version}</span>{m.themes.length > 0 && <span className="ml-2 rounded-md border border-line px-1.5 py-0.5 text-[11px] font-normal text-dim">Theme</span>}</span>
                        <span className="block text-[12px] text-faint">{m.description}</span>
                      </span>
                      <input type="checkbox" checked={m.enabled} onChange={(e) => void toggle(m.id, e.target.checked)} aria-label={`${m.name} on`} className="size-[18px] shrink-0 cursor-pointer accent-[var(--accent)]" />
                    </label></li>
                  ))}
                </ul>
                <p className="mt-2 text-[12px] leading-relaxed text-faint">Built-in kits are part of the image: they can be switched off, not removed.</p>
              </div>
            )}

            {!store && !error && <p className="mt-6 text-[13.5px] text-faint">Loading…</p>}
          </div>
        )}
      </aside>
      {review && <Review p={review} onCancel={() => setReview(null)} onDone={done} />}
    </div>
  );
}

