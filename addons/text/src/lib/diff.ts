/** Myers' O(ND) diff over any two arrays, plus the line and word views the UI needs. */
export type Op<T> = { t: "eq" | "del" | "add"; v: T; a?: number; b?: number };

/** Thrown when the two sides are too different to diff within the work limit. */
export class TooDifferent extends Error {
  constructor() { super("Too different to diff"); }
}

export interface DiffLimits {
  /** Most Int32 cells the O(D²) edit trace may hold before the linear-space search takes over (default 6M, about 24 MB). */
  traceCells?: number;
  /** Most diagonal steps in total before giving up with TooDifferent (default 150M, a second or two on the main thread). */
  steps?: number;
}

export function diff<T>(a: T[], b: T[], same: (x: T, y: T) => boolean = (x, y) => x === y, limits: DiffLimits = {}): Op<T>[] {
  let lo = 0;
  while (lo < a.length && lo < b.length && same(a[lo], b[lo])) lo++;
  let ea = a.length, eb = b.length;
  while (ea > lo && eb > lo && same(a[ea - 1], b[eb - 1])) { ea--; eb--; }
  const mid = middle(a.slice(lo, ea), b.slice(lo, eb), same, limits);
  const ops: Op<T>[] = [];
  for (let i = 0; i < lo; i++) ops.push({ t: "eq", v: a[i], a: i, b: i });
  for (const o of mid) ops.push(o.t === "eq" ? { ...o, a: o.a! + lo, b: o.b! + lo } : o.t === "del" ? { ...o, a: o.a! + lo } : { ...o, b: o.b! + lo });
  for (let k = 0; k < a.length - ea; k++) ops.push({ t: "eq", v: a[ea + k], a: ea + k, b: eb + k });
  return ops;
}

function middle<T>(A: T[], B: T[], same: (x: T, y: T) => boolean, limits: DiffLimits): Op<T>[] {
  const n = A.length, m = B.length;
  if (n === 0) return B.map((v, b) => ({ t: "add", v, b }));
  if (m === 0) return A.map((v, a) => ({ t: "del", v, a }));
  return myers(A, B, same, limits.traceCells ?? 6_000_000) ?? linear(A, B, same, limits.steps ?? 150_000_000);
}

/** The classic version: remember each round's frontier, walk back through them. Returns null when that would take too much memory. */
function myers<T>(A: T[], B: T[], same: (x: T, y: T) => boolean, cellLimit: number): Op<T>[] | null {
  const n = A.length, m = B.length;
  const max = n + m;
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  // round d only ever reads diagonals -d-1..d+1, so that is all we keep of it: O(D²) cells, not O(D·(N+M))
  const trace: Int32Array[] = [];
  let cells = 0;
  let done = false;
  for (let d = 0; d <= max && !done; d++) {
    cells += 2 * d + 3;
    if (cells > cellLimit) return null;
    trace.push(v.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && same(A[x], B[y])) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) { done = true; break; }
    }
  }
  // walk back through the saved frontiers: trace[d] is the frontier after round d-1
  const ops: Op<T>[] = [];
  let x = n, y = m;
  for (let d = trace.length - 1; d >= 1; d--) {
    const vv = trace[d];
    const at = (k: number) => vv[k + d + 1];
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const px = at(prevK);
    const py = px - prevK;
    while (x > px && y > py) { x--; y--; ops.push({ t: "eq", v: A[x], a: x, b: y }); }
    if (x === px) { y--; ops.push({ t: "add", v: B[y], b: y }); }
    else { x--; ops.push({ t: "del", v: A[x], a: x }); }
  }
  while (x > 0 && y > 0) { x--; y--; ops.push({ t: "eq", v: A[x], a: x, b: y }); }
  return ops.reverse();
}

/** Myers' linear-space refinement: find the middle snake, split there, recurse. Same minimal edit count, memory O(N+M). */
function linear<T>(A: T[], B: T[], same: (x: T, y: T) => boolean, stepLimit: number): Op<T>[] {
  const size = A.length + B.length + 3;
  const vf = new Int32Array(size), vb = new Int32Array(size);
  const ops: Op<T>[] = [];
  let steps = 0;

  // furthest-reaching paths from both ends until they meet; returns the snake (x,y)-(u,v) relative to the sub-problem
  const snake = (a0: number, n: number, b0: number, m: number): [number, number, number, number] => {
    const delta = n - m, odd = (delta & 1) !== 0;
    const max = (n + m + 1) >> 1;
    const off = max + 1;
    vf[off + 1] = 0; vb[off + 1] = 0;
    for (let d = 0; d <= max; d++) {
      steps += d + 1;
      if (steps > stepLimit) throw new TooDifferent();
      for (let k = -d; k <= d; k += 2) {
        let x = k === -d || (k !== d && vf[off + k - 1] < vf[off + k + 1]) ? vf[off + k + 1] : vf[off + k - 1] + 1;
        const x0 = x, y0 = x - k;
        let y = y0;
        while (x < n && y < m && same(A[a0 + x], B[b0 + y])) { x++; y++; }
        vf[off + k] = x;
        const kb = delta - k;
        if (odd && kb >= -(d - 1) && kb <= d - 1 && x + vb[off + kb] >= n) return [x0, y0, x, y];
      }
      for (let k = -d; k <= d; k += 2) {
        let x = k === -d || (k !== d && vb[off + k - 1] < vb[off + k + 1]) ? vb[off + k + 1] : vb[off + k - 1] + 1;
        const x0 = x, y0 = x - k;
        let y = y0;
        while (x < n && y < m && same(A[a0 + n - 1 - x], B[b0 + m - 1 - y])) { x++; y++; }
        vb[off + k] = x;
        const kf = delta - k;
        if (!odd && kf >= -d && kf <= d && x + vf[off + kf] >= n) return [n - x, m - y, n - x0, m - y0];
      }
    }
    throw new Error("diff: no middle snake");
  };

  const solve = (a0: number, n: number, b0: number, m: number) => {
    let lo = 0;
    while (lo < n && lo < m && same(A[a0 + lo], B[b0 + lo])) { ops.push({ t: "eq", v: A[a0 + lo], a: a0 + lo, b: b0 + lo }); lo++; }
    let hi = 0;
    while (hi < n - lo && hi < m - lo && same(A[a0 + n - 1 - hi], B[b0 + m - 1 - hi])) hi++;
    const rn = n - lo - hi, rm = m - lo - hi, ra = a0 + lo, rb = b0 + lo;
    if (rn === 0) for (let j = 0; j < rm; j++) ops.push({ t: "add", v: B[rb + j], b: rb + j });
    else if (rm === 0) for (let i = 0; i < rn; i++) ops.push({ t: "del", v: A[ra + i], a: ra + i });
    else {
      const [x, y, u, w] = snake(ra, rn, rb, rm);
      solve(ra, x, rb, y);
      for (let i = 0; i < u - x; i++) ops.push({ t: "eq", v: A[ra + x + i], a: ra + x + i, b: rb + y + i });
      solve(ra + u, rn - u, rb + w, rm - w);
    }
    for (let i = hi; i > 0; i--) ops.push({ t: "eq", v: A[a0 + n - i], a: a0 + n - i, b: b0 + m - i });
  };
  solve(0, A.length, 0, B.length);
  return ops;
}

/* ───── text views ───── */

export interface Part { text: string; changed: boolean }
export interface Side { n: number; text: string; parts?: Part[] }
export interface Row { kind: "eq" | "change" | "del" | "add"; left?: Side; right?: Side }
export interface DiffOptions { ignoreCase?: boolean; ignoreSpace?: boolean }
export interface DiffResult { rows: Row[]; added: number; removed: number; changed: number; same: boolean; tooDifferent?: boolean }

const norm = (s: string, o: DiffOptions) => {
  let t = s;
  if (o.ignoreSpace) t = t.replace(/\s+/g, " ").trim();
  if (o.ignoreCase) t = t.toLowerCase();
  return t;
};

const tokens = (s: string) => s.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? [];

/** Word-level highlight for one changed line pair. */
export function wordParts(a: string, b: string, o: DiffOptions = {}): { left: Part[]; right: Part[] } {
  const ta = tokens(a), tb = tokens(b);
  if (ta.length * tb.length > 250_000) return { left: [{ text: a, changed: true }], right: [{ text: b, changed: true }] };
  const na = ta.map((t) => norm(t, o)), nb = tb.map((t) => norm(t, o));
  const ops = diff(na, nb);
  const left: Part[] = [], right: Part[] = [];
  const push = (arr: Part[], text: string, changed: boolean) => { const last = arr[arr.length - 1]; if (last && last.changed === changed) last.text += text; else arr.push({ text, changed }); };
  for (const op of ops) {
    if (op.t === "eq") { push(left, ta[op.a!], false); push(right, tb[op.b!], false); }
    else if (op.t === "del") push(left, ta[op.a!], true);
    else push(right, tb[op.b!], true);
  }
  return { left, right };
}

export function diffText(a: string, b: string, o: DiffOptions = {}, limits?: DiffLimits): DiffResult {
  const split = (s: string) => (s === "" ? [] : s.replace(/\r\n?/g, "\n").split("\n"));
  const la = split(a), lb = split(b);
  // normalise each line once and compare small integers, not strings
  const ids = new Map<string, number>();
  const id = (l: string) => { const t = norm(l, o); let n = ids.get(t); if (n === undefined) ids.set(t, (n = ids.size)); return n; };
  const ia = la.map(id), ib = lb.map(id);
  let ops: Op<number>[];
  let tooDifferent = false;
  try {
    ops = diff(ia, ib, undefined, limits);
  } catch (e) {
    if (!(e instanceof TooDifferent)) throw e;
    // keep the shared head and tail, show everything in between as removed then added
    tooDifferent = true;
    let lo = 0;
    while (lo < ia.length && lo < ib.length && ia[lo] === ib[lo]) lo++;
    let ea = ia.length, eb = ib.length;
    while (ea > lo && eb > lo && ia[ea - 1] === ib[eb - 1]) { ea--; eb--; }
    ops = [];
    for (let i = 0; i < lo; i++) ops.push({ t: "eq", v: ia[i], a: i, b: i });
    for (let i = lo; i < ea; i++) ops.push({ t: "del", v: ia[i], a: i });
    for (let i = lo; i < eb; i++) ops.push({ t: "add", v: ib[i], b: i });
    for (let k = 0; k < ia.length - ea; k++) ops.push({ t: "eq", v: ia[ea + k], a: ea + k, b: eb + k });
  }
  const rows: Row[] = [];
  let added = 0, removed = 0, changed = 0;
  for (let i = 0; i < ops.length;) {
    if (ops[i].t === "eq") { rows.push({ kind: "eq", left: { n: ops[i].a! + 1, text: la[ops[i].a!] }, right: { n: ops[i].b! + 1, text: lb[ops[i].b!] } }); i++; continue; }
    const dels: Op<number>[] = [], adds: Op<number>[] = [];
    while (i < ops.length && ops[i].t !== "eq") { (ops[i].t === "del" ? dels : adds).push(ops[i]); i++; }
    const pair = tooDifferent ? 0 : Math.min(dels.length, adds.length);
    for (let k = 0; k < pair; k++) {
      const l = la[dels[k].a!], r = lb[adds[k].b!];
      const p = wordParts(l, r, o);
      rows.push({ kind: "change", left: { n: dels[k].a! + 1, text: l, parts: p.left }, right: { n: adds[k].b! + 1, text: r, parts: p.right } });
      changed++;
    }
    for (let k = pair; k < dels.length; k++) { rows.push({ kind: "del", left: { n: dels[k].a! + 1, text: la[dels[k].a!] } }); removed++; }
    for (let k = pair; k < adds.length; k++) { rows.push({ kind: "add", right: { n: adds[k].b! + 1, text: lb[adds[k].b!] } }); added++; }
  }
  return { rows, added, removed, changed, same: added + removed + changed === 0, ...(tooDifferent ? { tooDifferent } : {}) };
}
