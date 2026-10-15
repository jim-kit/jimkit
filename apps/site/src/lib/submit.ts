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
