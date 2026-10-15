/**
 * Where the site lives and what it says about itself, in one place: the page metadata, the sitemap, the structured data and the
 * social cards all read it. Set NEXT_PUBLIC_SITE_URL when building for another address (see apps/site/deploy/README.md)..
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://jimkit.thejimmy.dev").replace(/\/+$/, "");
export const SITE_NAME = "Jimkit";
/** The public repository. */
export const REPO_URL = (process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/jim-kit/jimkit").replace(/\/+$/, "");

export const TITLE = "Jimkit: self-hosted file converter and developer tools";
export const DESCRIPTION = "A free, open-source toolbox you host yourself: convert video, audio, images and documents, edit text and photos, hash files and format JSON. Docker or Proxmox.";
export const KEYWORDS = ["self-hosted", "file converter", "toolbox", "developer tools", "ffmpeg", "pandoc", "JSON formatter", "hash checker", "Docker", "Proxmox", "open source"];

/** An absolute address on the site, for the places that must not be relative (canonical links, the sitemap, structured data). */
export const absolute = (path: string) => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
