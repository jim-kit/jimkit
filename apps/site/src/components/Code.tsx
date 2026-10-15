"use client";

import { CopyBtn } from "@jimkit/ui";

/** A block of shell or config with a copy button. Lines starting with "$ " are commands (indented lines after one continue it); the copy takes only those. */
export function Code({ children, label, copy }: { children: string; label?: string; copy?: string }) {
  // what Copy takes: each "$ " command with the indented lines that continue it, without the "$ "
  const cmds: string[] = [];
  for (const l of children.split("\n")) {
    if (l.startsWith("$ ")) cmds.push(l.slice(2));
    else if (cmds.length && /^\s+\S/.test(l)) cmds[cmds.length - 1] += `\n${l}`;
  }
  const commands = cmds.join("\n");
  const text = copy ?? (commands || children);
  return (
    <div className="jk-card overflow-hidden rounded-xl">
      <div className="flex items-center justify-between gap-3 border-b border-line px-3.5 py-2">
        <span className="font-mono text-[12px] text-faint">{label ?? "shell"}</span>
        <CopyBtn text={text} />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-[1.7]"><code>{children.split("\n").map((l, i) => <span key={i} className="block">{l.startsWith("$ ") ? <><span className="select-none text-accent">$ </span>{l.slice(2)}</> : l.startsWith("#") ? <span className="text-faint">{l}</span> : l || " "}</span>)}</code></pre>
    </div>
  );
}
