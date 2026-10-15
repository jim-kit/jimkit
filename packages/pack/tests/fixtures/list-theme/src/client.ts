import { defineClient } from "@jimkit/sdk";
import { ListLayout } from "./ListLayout";

// a theme that is only a layout: no tools, and the id in `layouts` is the one `themes[].layout` names
export default defineClient({ tools: {}, layouts: { list: ListLayout } });
