"use client";

import { createContext, useContext } from "react";
import type { Host } from "./index";
import type { LayoutApi } from "./layout";

export const HostContext = createContext<Host | null>(null);

/** What a running tool gets from the host: the session, a way to open other tools, its own API, namespaced storage. */
export function useHost(): Host {
  const h = useContext(HostContext);
  if (!h) throw new Error("useHost() was called outside the Jimkit host");
  return h;
}

/** Set by the app around the layout of the current theme. */
export const LayoutContext = createContext<LayoutApi | null>(null);

/** What a layout draws the home screen from: the tools, the visitor's arrangement, and the actions. Only inside a layout. */
export function useLayout(): LayoutApi {
  const l = useContext(LayoutContext);
  if (!l) throw new Error("useLayout() was called outside a Jimkit layout");
  return l;
}
