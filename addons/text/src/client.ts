import { defineClient } from "@jimkit/sdk";

export default defineClient({
  tools: {
    "text-editor": () => import("./TextEditor"),
    diff: () => import("./DiffTool"),
    encode: () => import("./EncodeTool"),
  },
});
