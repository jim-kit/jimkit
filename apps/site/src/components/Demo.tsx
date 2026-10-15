"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

/** Which tool the workbench shows. The tool index, the search palette and the tiles set it, then take you to the workbench. */
const Ctx = createContext<{ active: string; show(id: string): void; setActive(id: string): void } | null>(null);
export const useDemo = () => useContext(Ctx)!;

export function DemoProvider({ first, children }: { first: string; children: ReactNode }) {
  const [active, setActive] = useState(first);
  const router = useRouter();
  const path = usePathname();
  const show = useCallback((id: string) => {
    setActive(id);
    if (path !== "/") return router.push("/#workbench");
    document.getElementById("workbench")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }, [path, router]);
  return <Ctx.Provider value={{ active, show, setActive }}>{children}</Ctx.Provider>;
}
