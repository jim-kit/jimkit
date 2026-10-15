import * as sdk from "@jimkit/sdk";
import * as sdkReact from "@jimkit/sdk/react";
import * as ui from "@jimkit/ui";
import * as motion from "@jimkit/ui/motion";
import * as React from "react";
import * as dom from "react-dom";
import * as jsx from "react/jsx-runtime";
import * as jsxDev from "react/jsx-dev-runtime";

/**
 * A kit is packed without React, the UI kit or the SDK (`jimkit kits pack`): its code reads them from here, so it renders with the
 * page's own React and follows the page's theme. The names are the ones `CLIENT_MODULES` in packages/pack lists.
 */
export function exposeHostModules() {
  const g = globalThis as unknown as { __jimkit?: { modules: Record<string, unknown> } };
  g.__jimkit ??= { modules: {} };
  Object.assign(g.__jimkit.modules, {
    react: React, "react/jsx-runtime": jsx, "react/jsx-dev-runtime": jsxDev, "react-dom": dom,
    "@jimkit/ui": ui, "@jimkit/ui/motion": motion, "@jimkit/sdk": sdk, "@jimkit/sdk/react": sdkReact,
  });
}
