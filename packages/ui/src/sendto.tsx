"use client";

import { useHost } from "@jimkit/sdk/react";
import { Forward } from "lucide-react";
import { useState } from "react";
import { Btn } from "./controls";
import { toast } from "./util";

/**
 * "Send to…": hands what a tool made to the visitor's choice of other tool (the list a dropped file gets: every installed tool that takes it).
 * `files` is the files, or a function that makes them when the button is pressed (so nothing is built until it is wanted). `as` is what they will be
 * called and typed (`{ name: "report.csv", type: "text/csv" }`): the button hides itself when no installed tool takes that.
 */
export function SendTo({ files, as, label = "Send to…", title = "Open this in another tool", disabled, className }: { files: File[] | (() => File[] | Promise<File[]>); as?: { name: string; type?: string }; label?: string; title?: string; disabled?: boolean; className?: string }) {
  const host = useHost();
  const [busy, setBusy] = useState(false);
  // `as` says what the files will be called and typed: when no installed tool takes such a file there is nothing to send to, and no button
  if (as && !host.canOffer([as])) return null;
  const go = async () => {
    setBusy(true);
    try {
      const list = typeof files === "function" ? await files() : files;
      if (list.length) host.offer(list);
    } catch (e) {
      toast.error("Couldn't hand that over", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };
  return <Btn onClick={() => void go()} disabled={disabled || busy} title={title} className={className}><Forward size={14} /> {label}</Btn>;
}
