import { json } from "@/core/http";
import { kitFailure, ownerOnly } from "@/core/store/guard";
import { storeView } from "@/core/store/service";

export const dynamic = "force-dynamic";

/** The Kits screen: what is built in, what is installed, what the registry lists. */
export async function GET(req: Request) {
  const refused = await ownerOnly(req, false);
  if (refused) return refused;
  try {
    return json(await storeView(new URL(req.url).searchParams.has("refresh")));
  } catch (e) {
    return kitFailure(e);
  }
}
