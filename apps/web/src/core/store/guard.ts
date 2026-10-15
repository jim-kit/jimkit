import { config } from "../config";
import { json, readJson, sameOrigin } from "../http";
import { getServerSession } from "../session";
import { KitError, kitsLocked } from "./kits";

/** Adding and removing kits runs other people's code on this machine: only from your own network, and only from our own pages. */
export async function ownerOnly(req: Request, write: boolean): Promise<Response | null> {
  if (write && kitsLocked()) return json({ error: "Adding and removing kits is switched off on this install (JIMKIT_KITS=off)." }, { status: 403 });
  if (write && !sameOrigin(req, config().proxyHops)) return json({ error: "forbidden" }, { status: 403 });
  const session = await getServerSession();
  if (session.tier !== "trusted") return json({ error: "Kits can only be added or removed from your own network." }, { status: 403 });
  return null;
}

export const kitFailure = (e: unknown): Response => {
  if (e instanceof KitError) return json({ error: e.message }, { status: e.status });
  console.error("kits:", e);
  return json({ error: "Something went wrong." }, { status: 500 });
};

export const readBody = async (req: Request): Promise<Record<string, unknown>> => {
  const body = await readJson(req);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
};
