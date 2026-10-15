import { defineClient } from "@jimkit/sdk";

export default defineClient({
  tools: { hash: () => import("./Hash") },
});
