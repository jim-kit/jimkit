/** Splitting a URL into parts and editing its query string, keeping the order and duplicates. */

export type Row = [key: string, value: string];
export interface UrlParts { protocol: string; username: string; password: string; hostname: string; port: string; pathname: string; hash: string; origin: string }
export type Parsed = { ok: true; parts: UrlParts; rows: Row[] } | { ok: false; error: string };

/** Reads %XX and + as the form encoding does, but leaves bad escapes as they are instead of failing */
export function decodeComponent(s: string): string {
  const t = s.replace(/\+/g, " ");
  try { return decodeURIComponent(t); } catch { return t; }
}

export function parseQuery(search: string): Row[] {
  const q = search.startsWith("?") ? search.slice(1) : search;
  if (!q) return [];
  return q.split("&").filter((p) => p !== "").map((p) => {
    const i = p.indexOf("=");
    return i < 0 ? [decodeComponent(p), ""] : [decodeComponent(p.slice(0, i)), decodeComponent(p.slice(i + 1))];
  });
}

export function buildQuery(rows: Row[]): string {
  const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  const parts = rows.filter(([k, v]) => k !== "" || v !== "").map(([k, v]) => (v === "" ? enc(k) : `${enc(k)}=${enc(v)}`));
  return parts.length ? "?" + parts.join("&") : "";
}

export function parseUrl(input: string): Parsed {
  const text = input.trim();
  if (!text) return { ok: false, error: "Enter a URL" };
  let u: URL;
  // "localhost:3000/path" and "example.com:8080" read as a URL whose scheme is the host name: with no scheme, a name and a port is a host
  const hostPort = /^[^/?#@\s:]+:\d+([/?#]|$)/.test(text);
  try { u = new URL(hostPort ? "https://" + text : text); } catch {
    if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) {
      try { u = new URL("https://" + text); } catch { return { ok: false, error: "Not a valid URL" }; }
    } else return { ok: false, error: "Not a valid URL" };
  }
  const { protocol, username, password, hostname, port, pathname, hash, origin } = u;
  return { ok: true, parts: { protocol, username, password, hostname, port, pathname, hash, origin }, rows: parseQuery(u.search) };
}

export function buildUrl(p: Pick<UrlParts, "protocol" | "username" | "password" | "hostname" | "port" | "pathname" | "hash">, rows: Row[]): string {
  const auth = p.username ? `${p.username}${p.password ? ":" + p.password : ""}@` : "";
  const host = p.hostname ? `//${auth}${p.hostname}${p.port ? ":" + p.port : ""}` : "";
  return `${p.protocol}${host}${p.pathname}${buildQuery(rows)}${p.hash}`;
}
