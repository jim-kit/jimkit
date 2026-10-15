import { json } from "@/core/http";
import { getServerSession } from "@/core/session";
import { checkForUpdate } from "@/core/updates";

export const dynamic = "force-dynamic";

/** Is a newer Jimkit published? Only from your own network: it is about your installation. `?refresh=1` looks again now. */
export async function GET(req: Request) {
  const session = await getServerSession();
  if (session.tier !== "trusted") return json({ error: "Only from your own network." }, { status: 403 });
  return json(await checkForUpdate({ force: new URL(req.url).searchParams.get("refresh") === "1" }));
}
