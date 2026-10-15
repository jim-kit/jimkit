"use client";
import type { ToolProps } from "@jimkit/sdk";
import { useHost } from "@jimkit/sdk/react";
import { Area, Btn, Pane, ToolFrame } from "@jimkit/ui";
import { useState } from "react";
import { countWords } from "./count";

export default function Tool({ tool, hue, onClose, mobile }: ToolProps) {
  const host = useHost();
  const [text, setText] = useState("");
  const [said, setSaid] = useState("");
  const ask = async () => setSaid((await (await host.api("word-count", "hello")).json()).message);
  return (
    <ToolFrame title={tool.name} icon={tool.icon} hue={hue} onClose={onClose} mobile={mobile} subtitle={`${countWords(text)} words`}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 bg-surface p-3 text-fg">
        <Pane title="Text" className="min-h-0 flex-1 rounded-xl border border-line"><Area label="Text" value={text} onChange={setText} /></Pane>
        <div className="flex items-center gap-3"><Btn onClick={() => void ask()}>Ask the server</Btn><span data-testid="said" className="text-[13px] text-dim">{said}</span></div>
      </div>
    </ToolFrame>
  );
}
