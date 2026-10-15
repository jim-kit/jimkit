/** What the Kits screen and the store API say to each other. Plain data: the browser imports this file, so nothing server-only goes in it. */

/** One kit as the registry lists it (the registry's index.json, see the jimkit-registry repository). */
export interface RegistryKit {
  /** lowercase "user/name" on GitHub */
  repo: string;
  name: string;
  description: string;
  author?: string;
  homepage?: string;
  tools: { name: string; blurb: string; icon: string }[];
  /** the looks it brings (a theme kit has these and no tools) */
  themes?: { name: string; blurb: string }[];
  latest: string;
  versions: RegistryVersion[];
  /** the mean of the written reviews, 1 to 5; null until there is one */
  rating: { average: number; count: number } | null;
  /** the newest few; the rest are in the registry repository */
  reviews: RegistryReview[];
  stars?: number;
}

export interface RegistryVersion {
  version: string;
  /** the release tag the bundle is attached to */
  tag: string;
  /** SHA-256 of jimkit-kit.json as it was when the registry looked; an install is refused if the download differs */
  sha256: string;
  size: number;
  date: string;
  server: boolean;
  apt?: string[];
}

export interface RegistryReview {
  /** the reviewer's GitHub username: the registry only accepts a review from the account that opened the pull request */
  user: string;
  rating: number;
  text: string;
  version?: string;
  date: string;
}

export interface RegistryView {
  /** "user/name" of the registry repository, or null when a plain URL is configured */
  repo: string | null;
  ok: boolean;
  error?: string;
  /** the last good copy is being shown because the latest fetch failed */
  stale?: boolean;
  kits: RegistryKit[];
}

/** An installed kit, as the browser sees it. */
export interface InstalledView {
  id: string;
  repo: string;
  version: string;
  name: string;
  description: string;
  installedAt: number;
  /** switched on (an installed kit can be switched off without removing it) */
  enabled: boolean;
  /** the names of the themes it brings */
  themes: string[];
}

export interface BuiltInView {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  /** the names of the themes it brings */
  themes: string[];
}

export interface StoreView {
  /** adding and removing kits is switched off (JIMKIT_KITS=off): the screen only lists and toggles */
  locked?: boolean;
  builtIn: BuiltInView[];
  kits: InstalledView[];
  registry: RegistryView;
}

/**
 * What a download is worth, said plainly:
 *  verified   the registry lists this exact file (same SHA-256), so it is what people reviewed
 *  unrecorded the registry lists the kit but hasn't seen this version yet
 *  unlisted   the kit isn't in the registry at all
 */
export type Trust = "verified" | "unrecorded" | "unlisted";

export interface Preview {
  /** pass this to install: it names the exact file that was looked at */
  sha256: string;
  repo: string;
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  homepage?: string;
  tools: { name: string; blurb: string; icon: string }[];
  /** the looks it brings */
  themes: { name: string; blurb: string }[];
  /** it runs code on this server */
  server: boolean;
  /** Debian packages it needs; a kit can't install them, so it says so if they're missing */
  apt: string[];
  settings: number;
  bytes: number;
  trust: Trust;
  /** something that stops the install: an id already in use, a tool id clash */
  conflict?: string;
  /** what installing does to what is there now */
  change: "new" | "update" | "same" | "older";
  installed?: string;
}
