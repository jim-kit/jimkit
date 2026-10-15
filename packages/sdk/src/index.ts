/**
 * @jimkit/sdk: everything an addon needs to describe itself and talk to the host.
 *
 * An addon is a folder (an npm workspace package) with
 *   package.json   with a "jimkit" field: the manifest (id, tools, file actions, system packages)
 *   src/client.ts  default export defineClient({ tools: { "<tool id>": () => import("./Tool") } })   (optional)
 *   src/server.ts  default export defineServer({ routes: { "POST thing/:id": handler } })            (optional)
 * See docs/addons.md.
 */
import type { ComponentType } from "react";

export const API_VERSION = 1;

/* ───────── sessions and limits ───────── */

/** "trusted" = on your network, "unlocked" = off-network with the unlock code, "public" = everyone else. */
export type Tier = "trusted" | "unlocked" | "public";

export interface Limits {
  maxFileBytes: number;
  maxBatchBytes: number;
  maxFiles: number;
  concurrentJobs: number;
  jobTimeoutSec: number;
  /** bytes a client may process per day, null = unlimited */
  dailyBytes: number | null;
  /** egress shaping for downloads in megabit/s, null = uncapped */
  bandwidthMbit: number | null;
}

/** What the browser is allowed to know about its session. */
export interface SessionView {
  tier: Tier;
  ip: string | null;
  limits: Limits;
  /** ms epoch, only while unlocked */
  expiresAt: number | null;
  /** server clock, so countdowns don't depend on the device's clock */
  now: number;
  unlockAvailable: boolean;
  ttlMinutes: number;
  /** set when the address in the browser's bar is not one the install answers to: it is treated as public until the owner lists it (JIMKIT_ALLOWED_HOSTS) */
  hostRefused?: boolean;
}

/* ───────── manifest ───────── */

export interface CategoryMeta {
  id: string;
  name: string;
  blurb: string;
  /** an icon name from the host's set, or one the addon registers in `icons` */
  icon: string;
  /** how the icon moves when the tool is pointed at: one of the names in `IconAnimation`. Optional: the built-in icons have their own, and any other icon is drawn in stroke by stroke. */
  iconAnimation?: IconAnimation;
  /** 0-360, used to colour the category's tiles */
  hue: number;
}

export interface ToolMeta {
  id: string;
  /** a category id, from the built-ins ("write", "convert", "edit", "inspect", "utilities") or one this addon declares */
  category: string;
  name: string;
  blurb: string;
  /** an icon name from the host's set, or one the addon registers in `icons` */
  icon: string;
  /** how the icon moves when the tool is pointed at: one of the names in `IconAnimation`. Optional: the built-in icons have their own, and any other icon is drawn in stroke by stroke. */
  iconAnimation?: IconAnimation;
  /** "soon" tools are listed but can't be opened */
  status?: "live" | "soon";
  /** only offered on the trusted and unlocked tiers */
  trusted?: boolean;
  /** extra words the search matches */
  keywords?: string[];
  /**
   * Other ids this tool answers to, each with what it starts with. For a tool that used to be several: bookmarks, favourites and recents
   * that name the old id open this one, started the old way. `{ "markdown": { "mode": "markdown" } }`.
   */
  aliases?: Record<string, ToolInit>;
  /** Ways to start the tool that show in its ⋮ menu and in search: "New Markdown document" opens the tool with that `init`. Up to 6. */
  quick?: QuickAction[];
}

export interface QuickAction {
  label: string;
  /** what the tool is opened with (its `init` prop) */
  init: ToolInit;
  /** extra words the search matches */
  keywords?: string[];
}

/** Offers a tool for files the user drops. Matching is by extension and/or MIME type. */
export interface FileActionMeta {
  id: string;
  tool: string;
  label: string;
  icon: string;
  accept: { ext?: string[]; mime?: string[] };
  /** higher is listed first */
  priority?: number;
}

/**
 * One setting an addon offers. The Settings panel draws a section for it (trusted visitors only), the value is stored in
 * jimkit.config.json under addonConfig[<addon id>], and the addon reads it as `ctx.config[key]` on the server or
 * `host.settings(addonId)[key]` in the browser.
 */
export interface SettingDef {
  /** the name the value is stored and read under */
  key: string;
  label: string;
  type: "boolean" | "number" | "text" | "select";
  /** used until someone changes it; must match `type` */
  default: boolean | number | string;
  /** one line under the control */
  help?: string;
  /** select only: the choices, as strings or { value, label } */
  options?: (string | { value: string; label: string })[];
  /** number only: values outside are clamped */
  min?: number;
  max?: number;
  /** text only: longest accepted value (default 200) */
  maxLength?: number;
}

/**
 * A look an addon (a theme kit) brings. Its stylesheet is the addon's `theme.css`; every rule in it should start with
 * `:root[data-theme="<id>"]` so it does nothing until the theme is chosen. Basic is built into the host and can't be replaced.
 */
export type { LayoutApi, LayoutCategory, LayoutComponent, LayoutParts, LayoutSort, LayoutTool } from "./layout";

export interface ThemeMeta {
  /** lowercase letters, digits and dashes; `data-theme` carries it. "basic" is taken. */
  id: string;
  name: string;
  /** one dry line under the name in Settings */
  blurb: string;
  /**
   * The id of the layout that draws the home screen: "grid" (the rail and the cards, built into the app and the default) or the id of a
   * layout this addon brings in `layouts` (see docs/layouts.md).
   */
  layout?: string;
  /**
   * The look is flat: cards don't lift when pointed at, controls keep the browser's own shapes, nothing eases. The app turns off its own
   * extras when this is set (it puts `data-flat` on the page). Metro is flat.
   */
  flat?: boolean;
  /** where it sits in the list of looks, lowest first (Basic is 0, the ones that ship are 10, 20, 30; the default is after all of those) */
  order?: number;
}

export interface AddonManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  apiVersion: number;
  author?: string;
  homepage?: string;
  categories?: CategoryMeta[];
  /** may be empty for an addon that only brings themes */
  tools: ToolMeta[];
  /** looks this addon brings: see ThemeMeta and docs/themes.md */
  themes?: ThemeMeta[];
  fileActions?: FileActionMeta[];
  /** Debian packages the addon's server code needs. The image build installs the union of all enabled addons'. */
  system?: { apt?: string[] };
  /** settings the owner can change from the Settings panel; see SettingDef */
  settings?: SettingDef[];
  /** documented environment variables, shown by `jimkit addons info` */
  env?: { name: string; description: string; default?: string }[];
  /** the addon has a src/server.ts */
  server?: boolean;
  /** the addon has a src/client.ts */
  client?: boolean;
  /** set by the host on an addon installed from GitHub (never part of the addon's own manifest) */
  source?: AddonSource;
}

/** Where an installed addon came from, so it can be updated and checked. */
export interface AddonSource {
  /** lowercase "user/name" on GitHub */
  repo: string;
  version: string;
  /** SHA-256 of the bundle as downloaded; also names the folder and the URL the browser loads it from */
  sha256: string;
  /** the kit ships a stylesheet */
  css?: boolean;
  /** the kit ships theme.css, the stylesheet of the themes it brings */
  themeCss?: boolean;
}

/* ───────── client side ───────── */

/** The motions an icon can have on hover. `draw` traces every stroke, `none` keeps it still. */
export type IconAnimation = "draw" | "spin" | "tumble" | "wiggle" | "pop" | "spread" | "pinch" | "bounce" | "none";
export const ICON_ANIMATIONS: readonly IconAnimation[] = ["draw", "spin", "tumble", "wiggle", "pop", "spread", "pinch", "bounce", "none"];

export interface ToolInit {
  files?: File[];
  text?: string;
  name?: string;
  [extra: string]: unknown;
}

export interface ToolProps {
  tool: ToolMeta;
  /** the tool's category hue (0-360), for ToolFrame and Tile */
  hue: number;
  init?: ToolInit;
  mobile: boolean;
  /** close the workspace */
  onClose(): void;
}

export interface ToolModule {
  default: ComponentType<ToolProps>;
}

export interface IconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export interface ClientModule {
  /** one lazy loader per tool id: the tool's code is only fetched when it is opened (an empty object for an addon that brings none) */
  tools: Record<string, () => Promise<ToolModule>>;
  /** layouts by id, for the themes this addon brings (`themes[].layout`): components with no props that draw the home screen. See docs/layouts.md. */
  layouts?: Record<string, ComponentType>;
  /** extra icons by name, for tools or categories whose icon isn't in the host's set */
  icons?: Record<string, ComponentType<IconProps>>;
}

export const defineClient = (m: ClientModule): ClientModule => m;

/** What the host gives a running tool. */
export interface Host {
  session: SessionView;
  mobile: boolean;
  /** open another tool, optionally with something to start from */
  open(toolId: string, init?: ToolInit): void;
  /**
   * Hand files to the visitor's choice of tool: the same "What should happen to this?" list a dropped file gets, showing every installed
   * tool that can take them. Use it for a "Send to…" button on whatever your tool produced.
   */
  offer(files: File[]): void;
  /**
   * Whether any installed tool takes files like these (it checks their names and types against every tool's `fileActions`). For hiding a
   * "Send to…" button that would only open an empty list: `host.canOffer([{ name: "result.csv", type: "text/csv" }])`.
   */
  canOffer(files: { name: string; type?: string }[]): boolean;
  /** whether a tool is installed and enabled, e.g. offer "Convert" only when a converter exists */
  hasTool(toolId: string): boolean;
  /** fetch from this addon's own API (/api/a/<addon>/...). Same-origin, cookies included. */
  api(addon: string, path: string, init?: RequestInit): Promise<Response>;
  /** the current values of an addon's settings (declared in its manifest), defaults filled in. Visible to every visitor, so keep secrets out of them. */
  settings(addon: string): Record<string, unknown>;
  /** localStorage namespaced to the addon. Never throws; returns null when storage is blocked. */
  storage(addon: string): { get(key: string): string | null; set(key: string, value: string): boolean; remove(key: string): void };
}

/* ───────── server side ───────── */

export interface ServerClient {
  /** random id in the client's cookie: owns uploads and jobs */
  id: string;
  ip: string;
  tier: Tier;
  limits: Limits;
  expiresAt: number | null;
  /** a Set-Cookie header the response must carry (the host adds it for you when you use `ctx.reply`) */
  setCookie?: string;
}

export interface AddonRequest {
  req: Request;
  url: URL;
  client: ServerClient;
  /** values of :params in the route pattern */
  params: Record<string, string>;
}

export type Handler = (r: AddonRequest, ctx: ServerContext) => Response | Promise<Response>;

export interface RouteOptions {
  handler: Handler;
  /** refuse the request below this tier (default "public": everyone) */
  minTier?: Tier;
}

/** A persistent, in-memory-indexed collection of small records, with retention and disk-cap sweeping done by the host. */
export interface BaseRecord {
  id: string;
  clientId: string;
  ip: string;
  /** ms epoch; the host deletes records older than the retention period */
  created: number;
  /** bytes this record holds on disk, counted against the client's allowance and the global cap */
  bytes?: number;
  /** ms epoch; set when the record stops being in use, retention counts from here */
  finished?: number;
}

export interface Records<T extends BaseRecord> {
  get(id: string): T | undefined;
  all(): T[];
  put(rec: T): Promise<void>;
  /** update the in-memory copy only (no disk write): for progress that changes many times a second */
  touch(rec: T): void;
  remove(id: string): Promise<void>;
  /** the directory that belongs to a record; created on put, removed on remove */
  dir(id: string): string;
}

export interface Queue {
  /**
   * Run `task` when there is room: globally (GLOBAL_JOBS) and for this key (usually the client's address).
   * Resolves when it has finished; rejects with whatever the task threw.
   */
  submit(task: { id: string; key: string; perKey: number; run(signal: AbortSignal): Promise<void> }): Promise<void>;
  cancel(id: string): void;
  /** 1-based position among waiting tasks, or null if running or unknown */
  position(id: string): number | null;
  running(): number;
  runningFor(key: string): number;
}

export interface Logger {
  info(...a: unknown[]): void;
  warn(...a: unknown[]): void;
  error(...a: unknown[]): void;
}

export interface ServerContext {
  addon: string;
  /** a directory only this addon writes to, inside the data volume */
  dataDir: string;
  /** this addon's section of jimkit.config.json ("addonConfig": { "<id>": {...} }) */
  config: Record<string, unknown>;
  /** how long scratch files live, and the cap on all of them */
  retentionMs: number;
  records<T extends BaseRecord>(name: string, opts?: { isBusy?: (rec: T) => boolean }): Records<T>;
  queue: Queue;
  /** bytes every record held by an address adds up to */
  bytesHeldBy(ip: string): number;
  daily: { used(ip: string): number; canUse(ip: string, bytes: number, limit: number | null): boolean; add(ip: string, bytes: number): void };
  engineThreads: number;
  /** resolves once every collection this addon opened has been read from disk: await it in onStart before touching records */
  ready(): Promise<void>;
  log: Logger;
  /** JSON reply with no-store and the client's cookie attached */
  reply(client: ServerClient, data: unknown, init?: ResponseInit): Response;
  /** a JSON error body: { error } */
  fail(client: ServerClient, status: number, message: string, extra?: Record<string, unknown>): Response;
}

/** What an addon reports about itself at start-up: can it do its job on this machine? */
export interface AddonStatus {
  /** false = the addon's tools are listed but can't be opened, with `reason` shown instead */
  ok: boolean;
  /** why it can't run, in words an admin can act on ("ffmpeg is not installed: use the full image") */
  reason?: string;
  /** a working addon with a limitation worth saying out loud ("only data formats without the full image") */
  note?: string;
}

export interface ServerModule {
  /** run after onStart: probe for the binaries, models or files the addon needs. Results are shown in the UI and by `jimkit doctor`. */
  check?(ctx: ServerContext): AddonStatus | Promise<AddonStatus>;
  /** "METHOD path/:param" -> handler. Mounted under /api/a/<addon>/. */
  routes: Record<string, Handler | RouteOptions>;
  /** once at start-up, after the data directory is ready */
  onStart?(ctx: ServerContext): void | Promise<void>;
}

export const defineServer = (m: ServerModule): ServerModule => m;
