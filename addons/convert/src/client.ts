import { defineClient } from "@jimkit/sdk";

export default defineClient({
  tools: { convert: () => import("./Convert") },
});
