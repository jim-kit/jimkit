"use client";

import type { ClientModule, ToolModule } from "@jimkit/sdk";
import { Btn, FrameMenu, Spinner, ToolFrame } from "@jimkit/ui";
import { Component, Suspense, lazy, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import type { ToolProps } from "@jimkit/sdk";
import { useToolMenu } from "./menus";
import { kitVersionOf, loadClient, useApp } from "./providers";

/** The tool's code didn't arrive (network blip, a deploy replaced the chunk): different from the tool crashing once running. */
class LoadFailure extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "LoadFailure";
  }
}

class Boundary extends Component<{ onClose(): void; onRetryLoad(): void; reloadNext: boolean; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("tool crashed:", error); }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const load = error instanceof LoadFailure;
    return (
      <div className="fixed inset-0 z-[65] grid place-items-center bg-bg p-8 text-center" role="alertdialog" aria-modal="true">
        <div className="max-w-md">
          <p className="text-[17px] font-semibold">{load ? "This tool couldn't be loaded." : "This tool crashed."}</p>
          <p className="mt-2 text-[14px] text-dim">{error.message}</p>
          <div className="mt-5 flex justify-center gap-2">
            <Btn onClick={() => (load ? this.props.onRetryLoad() : this.setState({ error: null }))}>{load && this.props.reloadNext ? "Reload the page" : "Try again"}</Btn>
            <Btn primary onClick={this.props.onClose}>Close</Btn>
          </div>
        </div>
      </div>
    );
  }
}

const cache = new Map<string, ComponentType<ToolProps>>();

/** Opens the current tool full-screen: its addon's client module is loaded on demand, then the tool's own chunk. */
export function Workspace() {
  const { current, catalog, closeTool, mobile } = useApp();
  const tool = current ? catalog.byId.get(current.toolId) : undefined;
  // React.lazy remembers a failed load for good, so a retry needs a new lazy component (and a new Boundary to drop the error)
  const menuFor = useToolMenu();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => setAttempt(0), [tool?.id]);
  const Tool = useMemo(() => {
    if (!tool) return null;
    const key = `${tool.addon}/${tool.id}@${kitVersionOf(tool.addon)}`;
    let C = cache.get(key);
    if (!C) {
      C = lazy(async () => {
        try {
          const mod: ClientModule = await loadClient(tool.addon);
          const load = mod.tools[tool.id];
          if (!load) throw new Error(`The "${tool.addon}" addon has no client for "${tool.id}".`);
          return (await load()) as ToolModule;
        } catch (e) {
          throw new LoadFailure(e);
        }
      });
      cache.set(key, C);
    }
    return C;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, attempt]);
  // a browser keeps a failed module fetch too, so after one fresh try the honest fix is a page reload
  const retryLoad = () => {
    if (!tool) return;
    if (attempt > 0) return window.location.reload();
    cache.delete(`${tool.addon}/${tool.id}@${kitVersionOf(tool.addon)}`);
    setAttempt(1);
  };

  if (!current || !tool || !Tool) return null;
  const cat = catalog.category(tool.category);
  return (
    <div key={`${tool.id}-${current.seq}`}>
      <FrameMenu value={() => menuFor(tool, "frame")}>
      <Boundary key={attempt} onClose={closeTool} onRetryLoad={retryLoad} reloadNext={attempt > 0}>
        <Suspense fallback={
          <ToolFrame title={tool.name} icon={tool.icon} hue={cat.hue} onClose={closeTool} mobile={mobile}>
            <div className="grid flex-1 place-items-center text-faint"><Spinner size={22} /></div>
          </ToolFrame>
        }>
          <Tool tool={tool} hue={cat.hue} init={current.init} mobile={mobile} onClose={closeTool} />
        </Suspense>
      </Boundary>
      </FrameMenu>
    </div>
  );
}
