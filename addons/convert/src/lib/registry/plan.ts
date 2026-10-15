import { EDGES, type EngineId } from "./edges";
import { formatOf, normalizeExt, type Format, type Kind } from "./formats";

export interface Step {
  engine: EngineId;
  from: string;
  to: string;
  lossy: boolean;
}

export interface Route {
  steps: Step[];
  /** the final format */
  to: string;
  lossy: boolean;
  /** formats passed through on the way, excluding the source and the target */
  via: string[];
  cost: number;
}

const LOSSY_PENALTY = 0.5; // prefer a lossless route when two cost about the same
const MAX_STEPS = 3;

interface Hop {
  engine: EngineId;
  to: string;
  lossy: boolean;
  weight: number;
}

let graph = new Map<string, Hop[]>();
let available: Set<EngineId> | null = null;

function build() {
  const g = new Map<string, Hop[]>();
  for (const e of EDGES) {
    if (available && !available.has(e.engine)) continue;
    for (const from of e.from) {
      const list = g.get(from) ?? [];
      for (const to of e.to) {
        if (to === from) continue;
        list.push({ engine: e.engine, to, lossy: !!e.lossyTo?.includes(to), weight: e.weight });
      }
      g.set(from, list);
    }
  }
  graph = g;
}
build();

/**
 * Only plan routes through engines that are installed. The server sets this from what it finds on the machine and the
 * browser from what the server says, so the UI never offers a conversion that can't run. null = assume everything is there.
 */
export function setAvailableEngines(engines: Iterable<EngineId> | null): void {
  available = engines ? new Set(engines) : null;
  build();
}

export const availableEngines = (): EngineId[] | null => (available ? [...available] : null);

/** Cheapest route from one format to every reachable one, at most MAX_STEPS long. Dijkstra over a tiny graph. */
export function routesFrom(fromExt: string): Map<string, Route> {
  const from = normalizeExt(fromExt);
  const best = new Map<string, Route>();
  const queue: Route[] = [{ steps: [], to: from, lossy: false, via: [], cost: 0 }];
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const cur = queue.shift()!;
    if (best.has(cur.to) && cur.to !== from) continue;
    if (cur.to !== from) best.set(cur.to, cur);
    if (cur.steps.length >= MAX_STEPS) continue;
    for (const hop of graph.get(cur.to) ?? []) {
      if (hop.to === from || cur.steps.some((s) => s.from === hop.to)) continue; // no loops
      const step: Step = { engine: hop.engine, from: cur.to, to: hop.to, lossy: hop.lossy };
      const next: Route = {
        steps: [...cur.steps, step],
        to: hop.to,
        lossy: cur.lossy || hop.lossy,
        via: cur.steps.length ? [...cur.via, cur.to] : [],
        cost: cur.cost + hop.weight + (hop.lossy ? LOSSY_PENALTY : 0) + (cur.steps.length ? 2 : 0),
      };
      const known = best.get(hop.to);
      if (!known || next.cost < known.cost) queue.push(next);
    }
  }
  return best;
}

export function planRoute(fromExt: string, toExt: string): Route | null {
  return routesFrom(fromExt).get(normalizeExt(toExt)) ?? null;
}

export interface Target {
  format: Format;
  route: Route;
}

export interface TargetGroup {
  kind: Kind;
  targets: Target[];
}

/** Everything a file of this type can become, grouped by kind, direct routes first. */
export function targetsFor(fromExt: string): TargetGroup[] {
  const groups = new Map<Kind, Target[]>();
  for (const route of routesFrom(fromExt).values()) {
    const format = formatOf(route.to);
    if (!format) continue;
    const list = groups.get(format.kind) ?? [];
    list.push({ format, route });
    groups.set(format.kind, list);
  }
  const order: Kind[] = ["image", "video", "audio", "document", "spreadsheet", "presentation", "text", "ebook", "data", "archive"];
  return order
    .filter((k) => groups.has(k))
    .map((kind) => ({ kind, targets: groups.get(kind)!.sort((a, b) => a.route.cost - b.route.cost || a.format.label.localeCompare(b.format.label)) }));
}

export function canConvertFrom(ext: string): boolean {
  return routesFrom(ext).size > 0;
}
