import { headers } from "next/headers";
import { enabledManifests } from "@/core/addons";
import { config } from "@/core/config";
import { json } from "@/core/http";
import { proxyWatch } from "@/core/proxywatch";
import { resolveSession } from "@/core/resolve";
import { appVersion } from "@/core/version";

export const dynamic = "force-dynamic";
const startedAt = Date.now();

export async function GET() {
  const cfg = config();
  const body: Record<string, unknown> = {
    ok: true,
    name: "jimkit",
    version: appVersion(),
    commit: (process.env.SOURCE_COMMIT ?? "dev").slice(0, 8),
    addons: enabledManifests().map((m) => m.id),
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
  };
  // for `jimkit doctor`; trusted visitors only (this request is not counted, the container's own health check would trip it)
  if (resolveSession(await headers(), undefined, cfg).tier === "trusted") body.proxy = { hops: cfg.proxyHops, ...proxyWatch() };
  return json(body);
}
