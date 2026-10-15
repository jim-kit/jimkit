/** Checks a person can make before the database does: the same rules, so the message is helpful and nothing is sent that would be refused. */

const REPO = /^[a-z0-9-]{1,39}\/[a-z0-9._-]{1,100}$/;

/** "ada/word-count", a GitHub address or "ada/word-count.git" -> { repo } in lowercase, or { error } in words. */
export function parseRepo(input: string, login: string): { repo: string } | { error: string } {
  const text = input.trim().replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "").replace(/\.git$/i, "").replace(/\/+$/, "").toLowerCase();
  if (!text) return { error: "Enter the repository as your-name/your-repo." };
  if (!REPO.test(text)) return { error: "That doesn't look like a GitHub repository. It should be your-name/your-repo." };
  if (text.split("/")[0] !== login.toLowerCase()) return { error: `You can submit kits under your own GitHub name (${login}). For a kit owned by an organisation, ask a maintainer to add it.` };
  return { repo: text };
}

/** Does the list of releases from GitHub's API contain a release that carries jimkit-kit.json? null means GitHub didn't say. */
export function hasKitRelease(releases: unknown): boolean | null {
  if (!Array.isArray(releases)) return null;
  return releases.some((r) => r && !(r as { draft?: boolean }).draft && Array.isArray((r as { assets?: unknown }).assets) && ((r as { assets: { name?: string }[] }).assets).some((a) => a?.name === "jimkit-kit.json"));
}

export type Status = "pending" | "approved" | "rejected";

export const statusText = (s: Status) => (s === "approved" ? "Approved" : s === "rejected" ? "Not approved" : "Waiting for approval");

/** What the database's refusal means to the person who triggered it. */
export function submitError(e: { code?: string; message?: string }): string {
  if (e.code === "23505") return "That kit has already been submitted.";
  if (e.code === "42501" || /row-level security/i.test(e.message ?? "")) return "The registry didn't accept that. You can submit up to 20 kits, under your own GitHub name.";
  if (e.code === "23514") return "That doesn't look like a valid repository name.";
  return "Something went wrong. Try again in a moment.";
}

export interface RepoChoice { repo: string; name: string; description: string; fork: boolean }

/**
 * The repositories someone can pick from, out of GitHub's list of their public repositories: newest push first, without archived ones
 * and without those already submitted. Whatever the API sent that doesn't look like a repository is ignored.
 */
export function repoChoices(rows: unknown, taken: Iterable<string> = []): RepoChoice[] {
  if (!Array.isArray(rows)) return [];
  const skip = new Set([...taken].map((t) => t.toLowerCase()));
  return rows
    .filter((r): r is { full_name: string; name: string; description?: string | null; fork?: boolean; archived?: boolean; pushed_at?: string | null } => !!r && typeof r.full_name === "string" && typeof r.name === "string" && /\/[A-Za-z0-9._-]+$/.test(r.full_name))
    .filter((r) => !r.archived && !skip.has(r.full_name.toLowerCase()))
    .sort((a, b) => String(b.pushed_at ?? "").localeCompare(String(a.pushed_at ?? "")))
    .map((r) => ({ repo: r.full_name.toLowerCase(), name: r.name, description: (r.description ?? "").slice(0, 80), fork: r.fork === true }));
}

export interface AdminKit { repo: string; submitted_by: string; status: Status; note: string | null; created_at: string }

/** The kits for the admin page, in the order a maintainer works through them: waiting first, then approved, then the rest; newest first inside each. */
export function groupKits(kits: AdminKit[]): Record<Status, AdminKit[]> {
  const out: Record<Status, AdminKit[]> = { pending: [], approved: [], rejected: [] };
  for (const k of [...kits].sort((a, b) => b.created_at.localeCompare(a.created_at))) out[k.status]?.push(k);
  return out;
}
