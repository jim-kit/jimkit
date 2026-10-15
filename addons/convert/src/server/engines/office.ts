import { access, cp, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { settings } from "../config";
import { run } from "@jimkit/sdk/server";
import { refuseWebAccess } from "./officeSafety";
import type { Engine } from "./types";

// Target extension to LibreOffice's export filter where the default guess isn't right.
const FILTER: Record<string, string> = { txt: "txt:Text (encoded):UTF8", csv: "csv:Text - txt - csv (StarCalc):44,34,76,1", html: "html:XHTML Writer File:UTF8" };
const FLAGS = ["--headless", "--norestore", "--nolockcheck", "--nodefault", "--nofirststartwizard", "--nologo"];

// A fresh LibreOffice profile takes several seconds to build, so one is built up front from a throwaway document
// and every job gets its own copy. A shared profile would keep a recent-files list across users, and two running
// instances can't share one anyway.
const template = () => join(settings.dataDir, "lo-template");
let warm: Promise<boolean> | null = null;

/**
 * Settings written into the profile once it exists. A document can carry addresses that LibreOffice goes and fetches (a picture linked
 * from the web, a spreadsheet function): a proxy that nothing answers on makes every such request fail instead of reaching whatever is
 * on this machine's network. (Spreadsheets that call WEBSERVICE are refused before LibreOffice runs; see officeSafety.ts.)
 */
const NO_NETWORK = [
  ["ooInetProxyType", "2"], ["ooInetHTTPProxyName", "127.0.0.1"], ["ooInetHTTPProxyPort", "9"], ["ooInetHTTPSProxyName", "127.0.0.1"], ["ooInetHTTPSProxyPort", "9"], ["ooInetFTPProxyName", "127.0.0.1"], ["ooInetFTPProxyPort", "9"], ["ooInetNoProxy", ""],
].map(([key, value]) => `<item oor:path="/org.openoffice.Inet/Settings"><prop oor:name="${key}" oor:op="fuse"><value>${value}</value></prop></item>`).join("\n");

/** Adds the settings above to the profile's registrymodifications.xcu, before its closing tag. */
export async function closeNetwork(profileUser: string): Promise<void> {
  const file = join(profileUser, "registrymodifications.xcu");
  const text = await readFile(file, "utf8").catch(() => `<?xml version="1.0" encoding="UTF-8"?>\n<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n</oor:items>\n`);
  await writeFile(file, text.replace(/<\/oor:items>\s*$/, `${NO_NETWORK}\n</oor:items>\n`));
}

export function warmLibreOffice(): Promise<boolean> {
  warm ??= (async () => {
    // a finished template has a marker: one without (an older build, or a warm-up that was killed half way) is rebuilt
    try {
      await access(join(template(), ".complete"));
      return true;
    } catch {
      /* build it */
    }
    // built next to where it will live and moved into place only when whole, so a stop in the middle leaves nothing that looks finished
    const building = `${template()}.building`;
    const tmp = join(settings.dataDir, "lo-warm");
    await rm(building, { recursive: true, force: true });
    await rm(tmp, { recursive: true, force: true });
    await mkdir(tmp, { recursive: true });
    await writeFile(join(tmp, "warm.txt"), "warm up\n");
    await run("soffice", [...FLAGS, `-env:UserInstallation=file://${building}`, "--convert-to", "pdf", "--outdir", tmp, join(tmp, "warm.txt")], {
      cwd: tmp, timeoutMs: 180_000, env: { HOME: building },
    });
    await rm(tmp, { recursive: true, force: true });
    await closeNetwork(join(building, "user"));
    await writeFile(join(building, ".complete"), "");
    await rm(template(), { recursive: true, force: true });
    await rename(building, template());
    return true;
  })().catch((e) => {
    console.error("LibreOffice warm-up failed (jobs will build a profile themselves):", e instanceof Error ? e.message : e);
    warm = null;
    return false;
  });
  return warm;
}

export const libreoffice: Engine = async (ctx) => {
  const profile = join(ctx.outDir, "lo-profile");
  const dest = join(ctx.outDir, "lo-out");
  await refuseWebAccess(ctx.input, ctx.inputExt);
  if (await warmLibreOffice()) await cp(template(), profile, { recursive: true });
  else { await mkdir(join(profile, "user"), { recursive: true }); await closeNetwork(join(profile, "user")); } // no template: the job's own profile is closed too

  const args = [...FLAGS, `-env:UserInstallation=file://${profile}`, "--convert-to", FILTER[ctx.to] ?? ctx.to, "--outdir", dest, ctx.input];
  await run("soffice", args, { cwd: ctx.outDir, timeoutMs: ctx.timeoutMs, signal: ctx.signal, env: { HOME: profile } });
  const made = (await readdir(dest)).filter((n) => n.endsWith(`.${ctx.to}`));
  if (!made.length) throw new Error("LibreOffice produced no output");
  return [join(dest, made[0])];
};
