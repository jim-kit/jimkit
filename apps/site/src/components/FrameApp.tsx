"use client";

import { useEffect, useState } from "react";
import { accentVars } from "@/lib/accent";
import type { Category, SiteTool } from "@/lib/catalog";
import { JSON_SEED, RunTool } from "./DemoWindow";

/** A tool filling the whole window. The page that embeds it can change the accent and mode by message. */
export function FrameApp({ tools, categories }: { tools: SiteTool[]; categories: Category[] }) {
  const [id, setId] = useState("text-editor");
  // ?doc=json opens the editor on a JSON document (the "looks" row on the home page)
  const [json, setJson] = useState(false);
  useEffect(() => {
    const want = new URLSearchParams(location.search).get("tool");
    if (want) setId(want);
    setJson(new URLSearchParams(location.search).get("doc") === "json");
    const on = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.data?.type !== "jk-look") return;
      const h = document.documentElement;
      if (e.data.mode === "dark" || e.data.mode === "light") h.dataset.mode = e.data.mode;
      if (typeof e.data.accent === "string") {
        for (const k of ["--accent", "--accent-fg", "--accent-rgb"]) h.style.removeProperty(k);
        for (const [k, v] of Object.entries(accentVars(e.data.accent, h.dataset.mode === "dark" ? "dark" : "light"))) h.style.setProperty(k, v);
        h.dataset.accent = e.data.accent;
      }
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, []);
  const tool = tools.find((t) => t.id === id && t.demo) ?? tools.find((t) => t.demo)!;
  return <div className="fixed inset-0"><RunTool tool={tool} tools={tools} categories={categories} onOpen={setId} seed={json ? JSON_SEED : undefined} /></div>;
}
