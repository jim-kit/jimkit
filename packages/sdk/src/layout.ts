/**
 * The layout API: what a layout (the whole home screen of a theme) is given, and nothing else of the app.
 *
 * A theme kit may bring a layout: a React component with no props that draws the page, using `useLayout()` for the tools, the
 * categories, the visitor's choices and the actions. It never reaches into the app itself, so the app can change inside without breaking
 * a layout, and a layout can't break the app. See docs/layouts.md.
 */
import type { ComponentType, HTMLAttributes, ReactNode } from "react";
import type { IconAnimation, SessionView, ToolInit } from "./index";

/** One tool, as a layout draws it. */
export interface LayoutTool {
  id: string;
  name: string;
  blurb: string;
  /** an icon name: draw it with `<Icon name={tool.icon} />` from `@jimkit/ui` */
  icon: string;
  iconAnimation?: IconAnimation;
  category: string;
  /**
   * The colour of the tool's tile. `hue` is 0 to 360; `hex` is an exact colour the visitor chose (use it as it is); `own` says the hue is a
   * swatch the visitor chose, so a layout that shifts hues to suit its look should leave it.
   */
  color: { hue: number; hex?: string; own: boolean };
  favourite: boolean;
  /** "ready" opens; "soon" is listed but not yet there; "locked" needs the unlock code; "unavailable" can't run on this machine (see `note`) */
  state: "ready" | "soon" | "locked" | "unavailable";
  /** why it is unavailable, or a limitation worth saying out loud */
  note?: string;
  /** ways to start it ("New JSON document"): open it with `api.open(tool, quick.init)` */
  quick: { label: string; init: ToolInit }[];
}

export interface LayoutCategory {
  id: string;
  name: string;
  blurb: string;
  icon: string;
  hue: number;
  /** the tools in the visitor's order. While arranging, hidden tools are included, with `hidden` set on the tool's sort handle. */
  tools: LayoutTool[];
}

/**
 * What a layout needs to let the visitor reorder things. Opaque: spread `item` on the element that is the item, `handle` on the part you
 * drag by (often the same element), and draw the controls with `parts.Grip`. `arranging` is true while the visitor is editing.
 */
export interface LayoutSort {
  item: HTMLAttributes<HTMLElement>;
  handle: HTMLAttributes<HTMLElement>;
  arranging: boolean;
  /** hidden by the visitor (only seen while arranging) */
  hidden: boolean;
}

/** The pieces the app draws for a layout, so every layout gets the same behaviour. */
export interface LayoutParts {
  /** the badge that says who you are (trusted, unlocked, public) and opens Settings */
  SessionChip: ComponentType<{ dotFirst?: boolean; className?: string }>;
  /** the star and colour buttons of one tool, for arranging */
  ToolMarks: ComponentType<{ tool: LayoutTool; className?: string; up?: boolean; align?: "left" | "right" }>;
  /** the controls of one item while arranging: earlier, later, hide, and the handle to drag by */
  Grip: ComponentType<{ sort: LayoutSort; axis?: "x" | "y"; compact?: boolean; parts?: "all" | "grip" | "rest"; className?: string }>;
  /** the bar that floats while arranging: Group small categories, Reset, Done. `corner` puts it in the top corner; `wide` offers "Two columns wide". */
  ArrangeBar: ComponentType<{ corner?: boolean; wide?: boolean }>;
  /** the ⋮ button of one tool: open, favourite, colour, hide, copy link and the tool's own quick actions */
  ToolMenuButton: ComponentType<{ tool: LayoutTool; className?: string }>;
  /** a dot that says a kit has an update / that Jimkit itself does */
  KitsDot: ComponentType;
  SettingsDot: ComponentType;
}

export interface LayoutApi {
  siteName: string;
  mode: "dark" | "light";
  setMode(mode: "dark" | "light"): void;
  mobile: boolean;
  session: SessionView;

  /** the categories as the visitor arranged them (hidden ones left out unless arranging) */
  categories: LayoutCategory[];
  /** categories that share a block, in order: `[["convert","edit","inspect"],["write"]]`. One id on its own stands alone. */
  groups: string[][];
  favourites: LayoutTool[];
  recents: LayoutTool[];
  /** the visitor's "Group small categories" and "Two columns wide" choices */
  prefs: { group: boolean; wide: boolean };
  setPrefs(patch: Partial<{ group: boolean; wide: boolean }>): void;

  /** opens a tool (and says why, in a message, when it can't be opened). `init` is what the tool starts with. */
  open(tool: LayoutTool | string, init?: ToolInit): void;
  /** the "What should happen to this?" list for files the visitor chooses */
  chooseFiles(): void;
  openSettings(): void;
  openSearch(): void;
  /** Kits is only for visitors on your own network */
  canManageKits: boolean;
  openKits(): void;

  arranging: boolean;
  setArranging(on: boolean): void;
  /** the visitor changed the default order or hid something */
  canReset: boolean;
  reset(): void;

  /** how many tools are installed, hidden or not (to tell "everything is hidden" from "nothing is installed") */
  toolCount: number;
  /**
   * The right-click (and long-press) menu of a tool, the same as the ⋮ button's: spread `bind` on the element and render `menu` anywhere.
   * Not while arranging, when the element is something to move.
   */
  useToolContextMenu(tool: LayoutTool): { bind: HTMLAttributes<HTMLElement>; menu: ReactNode };
  /** sorting hooks: call them in a component for each category and tool you draw, with the ids of its siblings in the order drawn */
  useToolSort(tool: LayoutTool, siblings: string[]): LayoutSort;
  useCategorySort(category: LayoutCategory, siblings: string[]): LayoutSort;
  parts: LayoutParts;
}

/** A layout is a component that takes no props and draws the page with `useLayout()`. */
export type LayoutComponent = ComponentType;
