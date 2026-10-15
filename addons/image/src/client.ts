import { defineClient } from "@jimkit/sdk";

export default defineClient({
  tools: { "image-editor": () => import("./Image") },
});
