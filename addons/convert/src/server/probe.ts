import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import type { EngineId } from "../lib/registry/edges";

/** Which programs each engine needs. Any one of the names is enough. */
export const REQUIRED: Record<EngineId, { bins: string[]; package: string } | null> = {
  imagemagick: { bins: ["convert", "magick"], package: "imagemagick" },
  rsvg: { bins: ["rsvg-convert"], package: "librsvg2-bin" },
  ffmpeg: { bins: ["ffmpeg"], package: "ffmpeg" },
  libreoffice: { bins: ["soffice"], package: "libreoffice" },
  pandoc: { bins: ["pandoc"], package: "pandoc" },
  "poppler-png": { bins: ["pdftoppm"], package: "poppler-utils" },
  "poppler-text": { bins: ["pdftotext"], package: "poppler-utils" },
  data: null, // in-process, always there
};

export function findBinary(name: string, path = process.env.PATH ?? "", executable: (p: string) => boolean = isExecutable): string | null {
  for (const dir of path.split(delimiter).filter(Boolean)) {
    const full = join(dir, name);
    if (executable(full)) return full;
  }
  return null;
}

function isExecutable(p: string): boolean {
  try {
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export interface Probe {
  engines: EngineId[];
  /** engines that are missing and the Debian packages that would provide them */
  missing: { engine: EngineId; package: string }[];
}

export function probeEngines(path?: string, executable?: (p: string) => boolean): Probe {
  const engines: EngineId[] = [];
  const missing: Probe["missing"] = [];
  for (const [id, req] of Object.entries(REQUIRED) as [EngineId, (typeof REQUIRED)[EngineId]][]) {
    if (!req || req.bins.some((b) => findBinary(b, path, executable))) engines.push(id);
    else missing.push({ engine: id, package: req.package });
  }
  return { engines, missing };
}
