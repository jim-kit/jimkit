import { defineClient } from "@jimkit/sdk";
import { StartScreen } from "./Start";

/** Metro brings no tools, only a look: its stylesheet (theme.css) and the Start-screen layout. */
export default defineClient({ tools: {}, layouts: { start: StartScreen } });
