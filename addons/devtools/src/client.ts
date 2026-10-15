import { defineClient } from "@jimkit/sdk";
import { CalendarClock, Calculator, Dices, Palette, Regex, Timer } from "lucide-react";

export default defineClient({
  tools: {
    regex: () => import("./RegexTool"),
    generate: () => import("./Generators"),
    time: () => import("./TimeTool"),
    colour: () => import("./ColourTool"),
    qr: () => import("./QrTool"),
    cron: () => import("./CronTool"),
    numbers: () => import("./NumbersTool"),
    url: () => import("./UrlTool"),
  },
  // icons the host's built-in set doesn't have
  icons: { CalendarClock, Calculator, Dices, Palette, Regex, Timer },
});
