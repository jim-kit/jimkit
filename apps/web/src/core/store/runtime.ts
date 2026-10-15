import { pathToFileURL } from "node:url";
import type { ServerModule } from "@jimkit/sdk";
import * as sdk from "@jimkit/sdk";
import * as sdkServer from "@jimkit/sdk/server";

/**
 * Loads the server code of an installed kit. The kit was packed with the SDK left out (`jimkit kits pack`); it reaches the
 * host's copy through globalThis.__jimkit.modules, which is set here before the file is imported. Each version lives in its own
 * folder, so an update is a new module and the old one is simply no longer routed to.
 */
export async function importKitServer(file: string): Promise<ServerModule> {
  const g = globalThis as unknown as { __jimkit?: { modules: Record<string, unknown> } };
  g.__jimkit ??= { modules: {} };
  Object.assign(g.__jimkit.modules, { "@jimkit/sdk": sdk, "@jimkit/sdk/server": sdkServer });
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pathToFileURL(file).href);
  if (!mod?.default?.routes) throw new Error("its server.js doesn't export defineServer({ routes })");
  return mod.default as ServerModule;
}
