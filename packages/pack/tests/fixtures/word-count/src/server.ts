import { defineServer } from "@jimkit/sdk";
import { throttle } from "@jimkit/sdk/server";
import { createHash } from "node:crypto";

export default defineServer({
  routes: {
    "GET hello": ({ client }, ctx) => ctx.reply(client, { message: `hello, ${client.tier}`, id: createHash("sha1").update("x").digest("hex"), t: typeof throttle }),
  },
});
