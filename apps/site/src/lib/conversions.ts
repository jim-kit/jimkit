import { EDGES } from "@jimkit/addon-convert/edges";

/**
 * Every direct conversion the converter knows, read from its own table (addons/convert/src/lib/registry/edges.ts), so what the page scatters
 * is what the product does. Routes that chain two edges (Markdown to DOCX goes through ODT) are not counted, so the total is a floor.
 */
export interface Conversion { label: string; engine: string }

function pairs(): Conversion[] {
  const seen = new Set<string>();
  const out: Conversion[] = [];
  for (const e of EDGES) for (const f of e.from) for (const t of e.to) {
    if (f === t) continue;
    const label = `${f.toUpperCase()} → ${t.toUpperCase()}`;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label, engine: e.engine });
  }
  return out;
}

// a small seeded generator, so the page is the same on every build
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

export interface Scatter { label: string; x: number; y: number; r: number; t: number; size: 0 | 1 | 2; look: 0 | 1 | 2; dx: number; dy: number; extra: boolean }

export function conversionCloud(count = 150) {
  const all = pairs();
  const rand = rng(20261012);
  const formats = new Set(EDGES.flatMap((e) => [...e.from, ...e.to]));
  // a spread across the engines first, then whatever is left: so images do not drown out documents and audio
  const byEngine = new Map<string, Conversion[]>();
  for (const c of all) byEngine.set(c.engine, [...(byEngine.get(c.engine) ?? []), c]);
  for (const list of byEngine.values()) list.sort(() => rand() - 0.5);
  const pool: Conversion[] = [];
  for (let i = 0; pool.length < count * 0.72; i++) { let any = false; for (const l of byEngine.values()) if (l[i]) { pool.push(l[i]); any = true; } if (!any) break; }
  // duplicates are fine: the rest of the chips repeat some of the first ones
  const labels = Array.from({ length: count }, (_, i) => (i < pool.length ? pool[i].label : pool[Math.floor(rand() * pool.length)].label));

  // a jittered grid covers the whole screen, with the order in which chips appear shuffled
  const cols = 14, rows = Math.ceil(count / cols);
  const cells = Array.from({ length: count }, (_, i) => ({ c: i % cols, r: Math.floor(i / cols) }));
  const order = Array.from({ length: count }, (_, i) => i).sort(() => rand() - 0.5);
  const items: Scatter[] = cells.map(({ c, r }, i) => {
    const x = ((c + 0.15 + rand() * 0.7) / cols) * 100;
    const y = ((r + 0.15 + rand() * 0.7) / rows) * 100;
    const a = Math.atan2(y - 50, x - 50);
    const far = 520 + rand() * 520;
    return {
      label: labels[i], x, y, r: Math.round((rand() - 0.5) * 30), t: 0.02 + (order[i] / count) * 0.84,
      size: (rand() < 0.14 ? 2 : rand() < 0.5 ? 1 : 0) as 0 | 1 | 2, look: Math.floor(rand() * 3) as 0 | 1 | 2,
      dx: Math.round(Math.cos(a) * far), dy: Math.round(Math.sin(a) * far), extra: i >= 78,
    };
  });
  return { items, pairs: all.length, formats: formats.size };
}
