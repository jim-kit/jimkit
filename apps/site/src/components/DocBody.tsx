"use client";

import { copyText } from "@jimkit/ui";

/** Rendered Markdown. The server writes the HTML (lib/docs.ts); this only wires the copy buttons on its code blocks. */
export function DocBody({ html }: { html: string }) {
  return (
    <div
      className="doc"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={async (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-copy]");
        if (!b) return;
        const code = b.parentElement?.querySelector("pre")?.textContent ?? "";
        await copyText(code);
        b.textContent = "Copied";
        setTimeout(() => { b.textContent = "Copy"; }, 1400);
      }}
    />
  );
}
