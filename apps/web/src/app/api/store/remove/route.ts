import { addonSettingsView } from "@/core/addonsettings";
import { config } from "@/core/config";
import { json } from "@/core/http";
import { kitFailure, ownerOnly, readBody } from "@/core/store/guard";
import { snapshot, storeView, uninstall } from "@/core/store/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const refused = await ownerOnly(req, true);
  if (refused) return refused;
  const body = await readBody(req);
  if (typeof body.id !== "string") return json({ error: "bad request" }, { status: 400 });
  try {
    uninstall(body.id);
    const snap = await snapshot();
    return json({ ok: true, ...snap, addonSettings: addonSettingsView(snap.manifests, config().addonConfig), store: await storeView() });
  } catch (e) {
    return kitFailure(e);
  }
}
