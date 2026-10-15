/** A small JSONPath: $ . name ['name'] [0] [-1] [*] .* [a:b] ..name. No filters or scripts. */
type Step =
  | { t: "key"; k: string }
  | { t: "index"; i: number }
  | { t: "all" }
  | { t: "slice"; from?: number; to?: number }
  | { t: "descend" };

export type Query = { ok: true; matches: unknown[] } | { ok: false; message: string };

function parse(path: string): Step[] | string {
  const p = path.trim();
  if (p[0] !== "$") return "A path starts with $";
  const steps: Step[] = [];
  let i = 1;
  while (i < p.length) {
    if (p.startsWith("..", i)) {
      steps.push({ t: "descend" });
      i += 2;
      // the selector after .. follows without its own dot
      if (p[i] === "*") { steps.push({ t: "all" }); i++; continue; }
      if (p[i] !== "[") { const m = /^[^.[\]*]+/.exec(p.slice(i)); if (!m) return `Expected a name after ..`; steps.push({ t: "key", k: m[0] }); i += m[0].length; }
      continue;
    }
    if (p[i] === ".") {
      i++;
      if (p[i] === "*") { steps.push({ t: "all" }); i++; continue; }
      const m = /^[^.[\]*]+/.exec(p.slice(i));
      if (!m) return `Expected a name at position ${i + 1}`;
      steps.push({ t: "key", k: m[0] }); i += m[0].length;
    } else if (p[i] === "[") {
      const end = p.indexOf("]", i);
      if (end < 0) return "Missing ]";
      const inner = p.slice(i + 1, end).trim();
      i = end + 1;
      let m: RegExpExecArray | null;
      if (inner === "*") steps.push({ t: "all" });
      else if ((m = /^'(.*)'$|^"(.*)"$/.exec(inner))) steps.push({ t: "key", k: m[1] ?? m[2] });
      else if (/^-?\d+$/.test(inner)) steps.push({ t: "index", i: Number(inner) });
      else if ((m = /^(-?\d*):(-?\d*)$/.exec(inner))) steps.push({ t: "slice", from: m[1] ? Number(m[1]) : undefined, to: m[2] ? Number(m[2]) : undefined });
      else return `Can't read [${inner}]`;
    } else return `Unexpected "${p[i]}" at position ${i + 1}`;
  }
  return steps;
}

const children = (v: unknown): unknown[] => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []);

function descendants(v: unknown, out: unknown[] = []): unknown[] {
  out.push(v);
  for (const c of children(v)) descendants(c, out);
  return out;
}

export function queryPath(value: unknown, path: string): Query {
  const steps = parse(path);
  if (typeof steps === "string") return { ok: false, message: steps };
  let nodes: unknown[] = [value];
  for (const s of steps) {
    const next: unknown[] = [];
    for (const n of nodes) {
      if (s.t === "descend") descendants(n, next);
      else if (s.t === "all") next.push(...children(n));
      else if (s.t === "key") { if (n && typeof n === "object" && !Array.isArray(n) && Object.hasOwn(n, s.k)) next.push((n as Record<string, unknown>)[s.k]); }
      else if (s.t === "index") { if (Array.isArray(n)) { const v = n[s.i < 0 ? n.length + s.i : s.i]; if (v !== undefined) next.push(v); } }
      else if (Array.isArray(n)) next.push(...n.slice(s.from, s.to));
    }
    nodes = next;
  }
  return { ok: true, matches: nodes };
}
