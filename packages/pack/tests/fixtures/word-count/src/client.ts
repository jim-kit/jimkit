import { defineClient } from "@jimkit/sdk";

export default defineClient({ tools: { "word-count-tool": () => import("./Tool") } });
