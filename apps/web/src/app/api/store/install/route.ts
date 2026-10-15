import { addonSettingsView } from "@/core/addonsettings";
import { config } from "@/core/config";
import { json } from "@/core/http";
import { kitFailure, ownerOnly, readBody } from "@/core/store/guard";
import { commit, snapshot, storeView } from "@/core/store/service";

export const dynamic = "force-dynamic";

/** Installs the file `inspect` showed (named by its hash). */
export async function POST(req: Request) {
  const refused = await ownerOnly(req, true);
  if (refused) return refused;
  const body = await readBody(req);
  if (typeof body.sha256 !== "string") return json({ error: "bad request" }, { status: 400 });
  try {
    const { record, warning } = await commit(body.sha256, body.acknowledged === true);
    const snap = await snapshot();
    return json({ ok: true, id: record.id, warning, ...snap, addonSettings: addonSettingsView(snap.manifests, config().addonConfig), store: await storeView() });
  } catch (e) {
    return kitFailure(e);
  }
}
