import { json } from "@/core/http";
import { getServerSession, sessionView } from "@/core/session";

export const dynamic = "force-dynamic";

export async function GET() {
  return json(sessionView(await getServerSession()));
}
