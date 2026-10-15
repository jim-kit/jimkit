import type { Session, SupabaseClient } from "@supabase/supabase-js";

/**
 * The registry's database. The key is Supabase's publishable one, public by design:
 * what a visitor may do is decided by the database's own rules (row level security), not by this page. A fork points these at its own project.
 */
export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://kjitkrkyuxyfygsdxvcp.supabase.co").replace(/\/+$/, "");
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY ?? "sb_publishable_O5uZOGAYPoRCmlGd6qctpQ_xwvqU95U";

let client: Promise<SupabaseClient> | undefined;

/** The client, loaded on first use so the pages that never sign anyone in don't carry it. */
export function supabase(): Promise<SupabaseClient> {
  client ??= import("@supabase/supabase-js").then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true } }));
  return client;
}

/** The GitHub name Supabase got from GitHub at sign-in, lowercase. Only for showing: the database checks it again itself. */
export const loginOf = (s: Session | null): string | null => {
  const m = (s?.user.user_metadata ?? {}) as Record<string, unknown>;
  const v = m.user_name ?? m.preferred_username;
  return typeof v === "string" && v ? v.toLowerCase() : null;
};

export async function signInWithGitHub() {
  const sb = await supabase();
  await sb.auth.signInWithOAuth({ provider: "github", options: { redirectTo: `${location.origin}${location.pathname}` } });
}

export async function signOut() {
  await (await supabase()).auth.signOut();
}
