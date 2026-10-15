"use client";

import type { AddonManifest, SettingDef } from "@jimkit/sdk";
import { settingOptions } from "@jimkit/sdk/settings";
import { Btn, ColorPicker, CopyBtn, Seg, toast, useDialogFocus, useOverlayEscape } from "@jimkit/ui";
import { ArrowUpRight, Check, Moon, Puzzle, RefreshCw, Sun, X } from "lucide-react";
import { useRef, useState } from "react";
import { accentHex, customAccent, DEFAULT_CUSTOM } from "./accent";
import { ACCENT_LIST, useApp } from "./providers";
import { save, saveJson } from "./save";
import { TIER_LABEL, TierIcon, UnlockForm, formatCountdown, limitRows, tierColor, useCountdown } from "./session-ui";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-7 first:mt-0"><h3 className="mb-3 text-[11.5px] font-semibold uppercase tracking-[.14em] text-faint">{title}</h3>{children}</section>;
}

/** Is a newer Jimkit published? It only says so: updating is `jimkit update` on the machine that runs it. */
function Updates() {
  const { appUpdate: u, checkAppUpdate } = useApp();
  const [busy, setBusy] = useState(false);
  const recheck = async () => { setBusy(true); await checkAppUpdate(true); setBusy(false); };
  if (!u) return <div className="rounded-xl border border-line px-3.5 py-3 text-[13px] text-faint">Checking…</div>;
  const state = u.source === null ? "Update checks are switched off (JIMKIT_UPDATES=off)." : u.newer ? `Jimkit ${u.latest} is available.` : u.latest ? "You are on the latest version." : (u.error ?? "Could not tell.");
  return (
    <div className="rounded-xl border border-line p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-medium">Jimkit {u.current}{u.newer && <span className="ml-2 rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-accent-fg">{u.latest}</span>}</p>
          <p className={`mt-0.5 text-[13px] ${u.newer ? "text-fg" : "text-dim"}`}>{state}</p>
        </div>
        {u.source !== null && <Btn onClick={recheck} disabled={busy} title="Look for a newer version now"><RefreshCw size={13} className={busy ? "animate-spin" : ""} /> Check</Btn>}
      </div>
      {u.newer && u.notes && <p className="mt-3 line-clamp-4 whitespace-pre-line text-[12.5px] leading-relaxed text-dim">{u.notes}</p>}
      {u.newer && u.url && <a href={u.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[13px] text-accent hover:underline">What changed <ArrowUpRight size={13} /></a>}
      {u.newer && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-line bg-field px-3 py-2">
          <span className="min-w-0 text-[12.5px] text-dim">On the machine that runs Jimkit:<span className="block truncate font-mono text-[12.5px] text-fg">jimkit update</span></span>
          <CopyBtn text="jimkit update" />
        </div>
      )}
    </div>
  );
}

const field = "rounded-lg border border-line-strong bg-field px-2.5 py-1.5 text-[13.5px] outline-none focus:border-accent";

function Control({ def, value, onChange }: { def: SettingDef; value: unknown; onChange(v: unknown): void }) {
  const [raw, setRaw] = useState(String(value)); // a number field has to hold half-typed text
  const label = def.label;
  if (def.type === "boolean") return <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} aria-label={label} className="size-[18px] cursor-pointer accent-[var(--accent)]" />;
  if (def.type === "select") return (
    <select value={String(value)} onChange={(e) => onChange(e.target.value)} aria-label={label} className={`${field} max-w-[200px]`}>
      {settingOptions(def).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
  if (def.type === "number") return (
    <input type="number" value={raw} min={def.min} max={def.max} aria-label={label} className={`${field} w-[110px] tabular-nums`}
      onChange={(e) => { setRaw(e.target.value); const n = Number(e.target.value); if (e.target.value.trim() !== "" && Number.isFinite(n)) onChange(n); }}
      onBlur={() => setRaw(String(value))} />
  );
  return <input value={String(value)} maxLength={def.maxLength ?? 200} onChange={(e) => onChange(e.target.value)} aria-label={label} spellCheck={false} className={`${field} w-[200px]`} />;
}

/** One addon's declared settings. Saved together; the server checks them against the manifest and clamps numbers. */
function AddonSettings({ manifest }: { manifest: AddonManifest }) {
  const { addonSettings, setAddonSettings } = useApp();
  const saved = addonSettings[manifest.id] ?? {};
  const [draft, setDraft] = useState(saved);
  const [gen, setGen] = useState(0); // remounts the controls so a half-typed number is dropped
  const defs = manifest.settings ?? [];
  const dirty = defs.some((d) => draft[d.key] !== saved[d.key]);
  const apply = async () => {
    const data = await saveJson({ addonConfig: { [manifest.id]: draft } });
    if (!data) return;
    const next = data.addonSettings as Record<string, Record<string, unknown>>;
    setAddonSettings(next);
    setDraft(next[manifest.id] ?? {});
    setGen((g) => g + 1);
    toast.success("Saved");
  };
  return (
    <div className="mt-4 first:mt-0">
      <p className="mb-2 text-[13px] font-medium">{manifest.name}</p>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {defs.map((d) => (
          <li key={d.key} className="flex items-center gap-3 px-3.5 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-[14px]">{d.label}</span>
              {d.help && <span className="block text-[12px] text-faint">{d.help}</span>}
            </span>
            <Control key={`${d.key}-${gen}`} def={d} value={draft[d.key]} onChange={(v) => setDraft((x) => ({ ...x, [d.key]: v }))} />
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <Btn primary disabled={!dirty} onClick={() => void apply()}>Save</Btn>
        {dirty && <Btn onClick={() => { setDraft(saved); setGen((g) => g + 1); }}>Undo</Btn>}
      </div>
    </div>
  );
}

export function Settings() {
  const { settings, setSettings, setKitsOpen, manifests, theme, themes, setTheme, mode, setMode, accent, setAccent, session, siteName, addonSettings, hasOrder, resetOrder } = useApp();
  const left = useCountdown(session);
  const panel = useRef<HTMLElement>(null);
  useOverlayEscape(settings, () => setSettings(false));
  useDialogFocus(panel, settings);
  const [name, setName] = useState(siteName);
  const [picker, setPicker] = useState(false);
  const custom = accentHex(accent);
  const [hex, setHex] = useState(custom ?? DEFAULT_CUSTOM);
  const pick = (v: string) => { const a = customAccent(v); if (a) { setHex(accentHex(a)!); setAccent(a); } };
  if (!settings) return null;
  const trusted = session.tier === "trusted";
  return (
    <div className="jk-fade fixed inset-0 z-[68] flex justify-end bg-black/55" onMouseDown={() => setSettings(false)}>
      <aside ref={panel} tabIndex={-1} className="jk-panel jk-slide flex h-full w-full max-w-[460px] flex-col border-y-0 border-r-0 outline-none" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Settings">
        <header className="flex shrink-0 items-center justify-between border-b border-line px-5 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
          <h2 className="text-[17px] font-semibold">Settings</h2>
          <button onClick={() => setSettings(false)} aria-label="Close" className="grid size-8 place-items-center rounded-lg text-faint hover:bg-tint-2 hover:text-fg"><X size={17} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 scroll-hide">
          <Section title="Look">
            <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Theme">
              {themes.map((t) => (
                <button key={t.id} role="radio" aria-checked={theme === t.id} onClick={() => setTheme(t.id)} className={`rounded-xl border p-3 text-left transition ${theme === t.id ? "border-accent bg-accent/10" : "border-line hover:border-line-strong"}`}>
                  <span className="block text-[14px] font-medium">{t.name}</span>
                  <span className="block text-[12px] text-faint">{t.blurb}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-[13px] text-dim">Mode</span>
              <Seg<"dark" | "light"> label="Mode" value={mode} onChange={setMode} options={[
                { id: "dark", label: <span className="flex items-center gap-1.5"><Moon size={14} /> Dark</span> },
                { id: "light", label: <span className="flex items-center gap-1.5"><Sun size={14} /> Light</span> },
              ]} />
            </div>
            <p className="mb-2 mt-4 text-[13px] text-dim">Colour</p>
            <div className="flex flex-wrap items-center gap-2.5" role="radiogroup" aria-label="Colour">
              {ACCENT_LIST.map((a) => (
                <button key={a.id} role="radio" aria-checked={accent === a.id} aria-label={a.name} onClick={() => setAccent(a.id)} style={{ background: a.color }}
                  className={`jk-round grid size-9 place-items-center rounded-full ${accent === a.id ? "ring-2 ring-fg ring-offset-2 ring-offset-surface" : ""}`}>
                  {accent === a.id && <Check size={16} className="text-white" />}
                </button>
              ))}
              <button role="radio" aria-checked={!!custom} aria-expanded={picker} aria-label="Pick your own colour" title="Pick your own colour" onClick={() => { setPicker((o) => !o); if (!custom) pick(hex); }}
                className={`jk-round grid size-9 place-items-center rounded-full ${custom ? "ring-2 ring-fg ring-offset-2 ring-offset-surface" : ""}`}
                style={{ background: custom ?? "conic-gradient(#f03e3e, #f59f00, #82c91e, #15aabf, #4c6ef5, #be4bdb, #f03e3e)" }}>
                {custom && <Check size={16} className="text-white mix-blend-difference" />}
              </button>
            </div>
            {picker && (
              <div className="mt-3 rounded-xl border border-line p-3">
                <ColorPicker value={custom ?? hex} onChange={(v) => pick(v)} />
                <div className="mt-3 flex items-center gap-2.5">
                  <span className="size-7 shrink-0 rounded-md border border-line-strong" style={{ background: custom ?? hex }} />
                  <input value={hex} onChange={(e) => { setHex(e.target.value); if (customAccent(e.target.value)) pick(e.target.value); }} aria-label="Hex colour" spellCheck={false} maxLength={7}
                    className="w-[96px] rounded-lg border border-line-strong bg-field px-2 py-1.5 font-mono text-[12.5px] outline-none focus:border-accent" />
                </div>
              </div>
            )}
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
              <span className="min-w-0 text-[13px] text-dim">Layout<span className="block text-[12px] text-faint">Order and hidden items, set with Edit on the home screen.</span></span>
              <Btn onClick={() => { resetOrder(); toast("Layout reset"); }} disabled={!hasOrder}>Reset layout</Btn>
            </div>
          </Section>

          {trusted && (
            <Section title="Updates"><Updates /></Section>
          )}

          <Section title="Kits">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-3">
              <span className="min-w-0 text-[13px] text-dim">Add tools from GitHub, update them, switch built-in ones off.<span className="block text-[12px] text-faint">{manifests.length} on now{trusted ? "" : ". Only you can change this, from your own network."}</span></span>
              {trusted && <Btn onClick={() => { setSettings(false); setKitsOpen(true); }}><Puzzle size={14} /> Manage</Btn>}
            </div>
          </Section>

          {trusted && manifests.some((m) => addonSettings[m.id]) && (
            <Section title="Addon settings">
              {manifests.filter((m) => addonSettings[m.id]).map((m) => <AddonSettings key={m.id} manifest={m} />)}
            </Section>
          )}

          {trusted && (
            <Section title="Site">
              <div className="flex gap-2">
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Site name" className="min-w-0 flex-1 rounded-xl border border-line-strong bg-field px-3 py-2 text-[14px] outline-none focus:border-accent" />
                <Btn onClick={async () => { if (await save({ siteName: name })) toast.success("Saved", { description: "Reload to see it." }); }}>Save</Btn>
              </div>
              <p className="mt-2 text-[12px] text-faint">New visitors start with whatever look you pick here.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Btn onClick={async () => { if (await save({ theme, mode, accent })) toast.success("Saved as the default look"); }}>Make this the default look</Btn>
              </div>
            </Section>
          )}

          <Section title="Your session">
            <div className="rounded-xl border border-line p-3.5">
              <div className="flex items-center gap-2 text-[14px] font-medium"><span style={{ color: tierColor(session.tier) }}><TierIcon tier={session.tier} /></span>{TIER_LABEL[session.tier]}{left !== null && <span className="font-normal tabular-nums text-faint">· {formatCountdown(left)} left</span>}</div>
              {session.ip && <p className="mt-0.5 font-mono text-[12px] text-faint">{session.ip}</p>}
              <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[13px]">
                {limitRows(session).map(([k, v]) => (<div key={k} className="contents"><dt className="text-dim">{k}</dt><dd className="text-right tabular-nums">{v}</dd></div>))}
              </dl>
            </div>
            {session.tier === "public" && <div className="mt-3"><UnlockForm /></div>}
            {session.tier === "unlocked" && <div className="mt-3"><Btn onClick={async () => { await fetch("/api/lock", { method: "POST" }); location.reload(); }}>Lock again</Btn></div>}
          </Section>
        </div>
      </aside>
    </div>
  );
}
