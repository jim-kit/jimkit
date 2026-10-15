"use client";

import type { ReactNode } from "react";
import { CopyBtn, cx } from "@jimkit/ui";

/** Shared look for the small form controls these tools use, so they match in every theme. */
export const inputCls = "min-w-0 rounded-xl border border-line-strong bg-field px-3 py-2 text-[13px] text-fg outline-none transition placeholder:text-faint/60 focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-50";

export function Input({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { "aria-label"?: string }) {
  return <input spellCheck={false} autoCapitalize="off" autoComplete="off" autoCorrect="off" {...p} className={cx(inputCls, p.type !== "number" && "font-mono", className)} />;
}

export function Field({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("flex min-w-0 flex-col gap-1 text-[12px] text-faint", className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Select({ className, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx(inputCls, "pr-8", className)}>{children}</select>;
}

/** A label, a value in monospace, and a copy button. */
export function ValueRow({ label, value, hint }: { label: ReactNode; value: string; hint?: ReactNode }) {
  return (
    <li className="flex items-start gap-3 px-3.5 py-2.5">
      <span className="mt-0.5 w-[84px] shrink-0 text-[12px] font-semibold tracking-wide text-faint">{label}</span>
      <span className="min-w-0 flex-1 break-all font-mono text-[13px] leading-relaxed">{value || <span className="text-faint/60">—</span>}{hint && <span className="ml-2 font-sans text-[12px] text-faint">{hint}</span>}</span>
      <CopyBtn text={value} label="" disabled={!value} />
    </li>
  );
}

export function ErrorLine({ children }: { children: ReactNode }) {
  return <p role="alert" className="text-[13px] text-bad">{children}</p>;
}
