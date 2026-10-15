import { dispatch } from "@/core/addons";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ addon: string; path: string[] }> };
const handle = async (req: Request, ctx: Ctx) => {
  const { addon, path } = await ctx.params;
  return dispatch(req, addon, path);
};

export { handle as GET, handle as HEAD, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
