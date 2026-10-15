import { json } from "@/core/http";
import { kitFailure, ownerOnly, readBody } from "@/core/store/guard";
import { inspect } from "@/core/store/service";

export const dynamic = "force-dynamic";

/** Downloads a kit and says what installing it would do. Nothing is installed. */
export async function POST(req: Request) {
  const refused = await ownerOnly(req, true);
  if (refused) return refused;
  const body = await readBody(req);
  if (typeof body.source !== "string") return json({ error: "Say which kit: a GitHub link or user/name." }, { status: 400 });
  try {
    return json(await inspect(body.source, { version: typeof body.version === "string" ? body.version : undefined }));
  } catch (e) {
    return kitFailure(e);
  }
}
