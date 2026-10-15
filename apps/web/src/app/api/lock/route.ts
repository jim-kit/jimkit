import { cookies } from "next/headers";
import { config } from "@/core/config";
import { json, sameOrigin } from "@/core/http";
import { getServerSession, sessionView } from "@/core/session";
import { COOKIE_NAME } from "@/core/unlock";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req, config().proxyHops)) return json({ error: "forbidden" }, { status: 403 });
  (await cookies()).delete(COOKIE_NAME);
  const s = await getServerSession();
  // a trusted client stays trusted; everyone else drops to public right away
  return json(sessionView(s.tier === "trusted" ? s : { ...s, tier: "public", limits: config().limits.public, expiresAt: null }));
}
