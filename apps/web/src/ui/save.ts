import { toast } from "@jimkit/ui";

/** POST /api/settings. Shows the server's reason when it refuses; returns the answer, or null. */
export async function saveJson(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) toast.error(data.error ?? "Couldn't save");
    return r.ok ? data : null;
  } catch {
    toast.error("Couldn't reach the server");
    return null;
  }
}
export const save = async (body: Record<string, unknown>) => (await saveJson(body)) !== null;
