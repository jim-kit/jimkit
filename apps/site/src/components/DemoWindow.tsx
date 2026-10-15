"use client";

import { HostContext } from "@jimkit/sdk/react";
import type { ClientModule, Host, ToolInit, ToolMeta, ToolModule, ToolProps } from "@jimkit/sdk";
import { Embedded, Icon, Spinner, Tile, registerIcons } from "@jimkit/ui";
import { Component, Suspense, lazy, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import type { Category, SiteTool } from "@/lib/catalog";

/** The addons whose code runs in the page. Loaded on demand, one chunk each. */
const CLIENTS: Record<string, () => Promise<{ default: ClientModule }>> = {
  text: () => import("@jimkit/addon-text/client"),
  hash: () => import("@jimkit/addon-hash/client"),
  devtools: () => import("@jimkit/addon-devtools/client"),
};

/** A JSON document for the text editor, which opens it in its JSON mode with the tree beside it: what the "looks" row shows. */
export const JSON_SEED: ToolInit = { name: "config.json", text: "{\n  \"name\": \"jimkit\",\n  \"version\": \"0.1.0\",\n  \"themes\": [\"basic\", \"paper\", \"glass\", \"metro\"],\n  \"tiers\": { \"trusted\": true, \"unlocked\": false, \"public\": false }\n}\n" };

/** What a tool starts with, so the first look at it is not an empty box. */
const SEED: Record<string, ToolInit> = {
  "text-editor": { name: "notes.txt", text: "Jimkit keeps small tools in one place.\n\nThis is the text editor. Find and replace, line numbers and a word count are in the bar above.\nEverything on this page is the real tool.\n" },
  hash: { name: "text", text: "Jimkit" },
};

/** Per-addon storage that lives as long as the page. */
const stores = new Map<string, ReturnType<Host["storage"]>>();
function memoryStorage(addon: string): ReturnType<Host["storage"]> {
  let s = stores.get(addon);
  if (!s) {
    const m = new Map<string, string>();
    s = { get: (k) => m.get(k) ?? null, set: (k, v) => (m.set(k, v), true), remove: (k) => void m.delete(k) };
    stores.set(addon, s);
  }
  return s;
}

class Boundary extends Component<{ id: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidUpdate(prev: { id: string }) { if (prev.id !== this.props.id && this.state.error) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="grid h-full place-items-center p-8 text-center"><div><p className="text-[16px] font-semibold">This tool did not load.</p><p className="mt-2 text-[13.5px] text-dim">{this.state.error.message}</p></div></div>;
  }
}

const loaded = new Map<string, ComponentType<ToolProps>>();
function toolComponent(t: SiteTool): ComponentType<ToolProps> {
  let C = loaded.get(t.id);
  if (!C) {
    C = lazy(async () => {
      const mod = (await CLIENTS[t.addon]()).default;
      if (mod.icons) registerIcons(mod.icons as never);
      const load = mod.tools[t.id];
      if (!load) throw new Error(`The ${t.addon} addon has no client for ${t.id}.`);
      return (await load()) as ToolModule;
    });
    loaded.set(t.id, C);
  }
  return C;
}

function useMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
}

/** One tool, running in whatever box this is put in. The tools ask their host for a few things; this host has no server behind it. */
export function RunTool({ tool, tools, categories, seq = 0, onOpen, seed }: { tool: SiteTool; tools: SiteTool[]; categories: Category[]; seq?: number; onOpen?: (id: string) => void; seed?: ToolInit }) {
  const mobile = useMobile();
  const runnable = useMemo(() => tools.filter((t) => t.demo), [tools]);
  const cat = categories.find((c) => c.id === tool.category)!;
  const host = useMemo<Host>(() => ({
    session: { tier: "trusted", ip: null, expiresAt: null, now: Date.now(), unlockAvailable: false, ttlMinutes: 0, limits: { maxFileBytes: 30 * 1024 ** 3, maxBatchBytes: 30 * 1024 ** 3, maxFiles: 50, concurrentJobs: 2, jobTimeoutSec: 600, dailyBytes: null, bandwidthMbit: null } },
    mobile,
    open: (id) => { if (runnable.some((t) => t.id === id)) onOpen?.(id); },
    offer: () => {}, // the demo has no list of other tools to offer
    canOffer: () => false,
    hasTool: (id) => runnable.some((t) => t.id === id),
    api: async () => new Response("This demo has no server.", { status: 404 }),
    settings: () => ({}),
    storage: memoryStorage,
  }), [mobile, runnable, onOpen]);
  const meta: ToolMeta = { id: tool.id, category: tool.category, name: tool.name, blurb: tool.blurb, icon: tool.icon };
  const Tool = toolComponent(tool);
  useEffect(() => { void CLIENTS[tool.addon]?.().then((m) => m.default.icons && registerIcons(m.default.icons as never)); }, [tool.addon]);
  // the box is a containing block for the tool's frame (which is absolutely positioned inside it)
  return (
    <div className="relative size-full bg-bg" style={{ transform: "translateZ(0)" }}>
      <Embedded>
        <HostContext.Provider value={host}>
          <Boundary id={tool.id}>
            <Suspense fallback={<div className="absolute inset-0 grid place-items-center text-faint"><Spinner size={22} /></div>}>
              <Tool key={`${tool.id}-${seq}`} tool={meta} hue={cat.hue} init={seed ?? SEED[tool.id]} mobile={mobile} onClose={() => {}} />
            </Suspense>
          </Boundary>
        </HostContext.Provider>
      </Embedded>
    </div>
  );
}

export function DemoWindow({ tools, categories, active, onActive }: { tools: SiteTool[]; categories: Category[]; active: string; onActive: (id: string) => void }) {
  const runnable = useMemo(() => tools.filter((t) => t.demo), [tools]);
  const tool = runnable.find((t) => t.id === active) ?? runnable[0];
  const [seq, setSeq] = useState(0);
  const byCat = categories.map((c) => ({ c, items: runnable.filter((t) => t.category === c.id) })).filter((g) => g.items.length);

  return (
    <div className="jk-panel overflow-hidden rounded-2xl shadow-2xl">
      <div className="flex flex-col md:flex-row">
        {/* the tool list: a rail on a wide screen, a strip you swipe on a phone */}
        <nav aria-label="Tools in the demo" className="shrink-0 border-b border-line md:w-[210px] md:border-b-0 md:border-r">
          <div className="scroll-hide flex gap-1 overflow-x-auto p-2 md:max-h-[640px] md:flex-col md:gap-0.5 md:overflow-y-auto md:p-2.5">
            {byCat.map(({ c, items }) => (
              <div key={c.id} className="contents">
                <p className="font-mono-label hidden px-2.5 pb-1 pt-3 text-faint first:pt-1 md:block">{c.name}</p>
                {items.map((t) => (
                  <button key={t.id} onClick={() => { onActive(t.id); setSeq((s) => s + 1); }} aria-current={t.id === tool.id} className={`flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors ${t.id === tool.id ? "bg-tint-2 text-fg" : "text-dim hover:bg-tint hover:text-fg"}`}>
                    <Tile icon={t.icon} hue={c.hue} size={22} />
                    <span className="whitespace-nowrap">{t.name}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </nav>
        <div className="h-[min(640px,80vh)] min-h-[440px] min-w-0 md:flex-1"><RunTool tool={tool} tools={tools} categories={categories} seq={seq} onOpen={onActive} /></div>
      </div>
    </div>
  );
}
