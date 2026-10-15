import { describe, expect, it } from "vitest";
import { buildHome, DEFAULT_LAYOUT, parseFavs, serializeFavs, parseHues, serializeHues, isHueValue, tint, pinFavourites, parseLayout, serializeLayout, moveBy, moveItem, NO_ORDER, packGroups, parseHidden, parseOrder, serializeHidden, serializeOrder, sortByOrder, targetIndex, withCategoryOrder, withToolOrder, type Rect } from "../src/ui/arrange";

const cats = [{ id: "write" }, { id: "convert" }, { id: "edit" }, { id: "inspect" }, { id: "utilities" }];
const tool = (id: string, category: string) => ({ id, category });
const tools = [tool("text", "write"), tool("md", "write"), tool("conv", "convert"), tool("img", "edit"), tool("hash", "inspect"), tool("a", "utilities"), tool("b", "utilities"), tool("c", "utilities"), tool("d", "utilities")];
const src = { categories: cats, tools };
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("order cookie", () => {
  it("round-trips", () => {
    const o = { cats: ["edit", "write"], tools: ["md", "text", "conv"] };
    expect(serializeOrder(o)).toBe("edit.write~md.text.conv");
    expect(parseOrder(serializeOrder(o))).toEqual(o);
  });
  it("is empty when there is nothing to say", () => {
    expect(serializeOrder({ cats: [], tools: [] })).toBe("");
    expect(parseOrder("")).toEqual({ cats: [], tools: [] });
    expect(parseOrder(undefined)).toEqual({ cats: [], tools: [] });
  });
  it("drops what can't be written safely, and repeats", () => {
    expect(serializeOrder({ cats: ["a", "b;c", "a", "d e", "x=y"], tools: ["t,1", "t2"] })).toBe("a~t2");
    expect(parseOrder("a.a.b c.é~x.;.y")).toEqual({ cats: ["a"], tools: ["x", "y"] });
  });
  it("ignores junk and oversized input", () => {
    expect(parseOrder("~~~")).toEqual({ cats: [], tools: [] });
    expect(parseOrder("a".repeat(5000))).toEqual({ cats: [], tools: [] });
  });
  it("stays under the limit by dropping whole ids from the end of the tool list", () => {
    const many = Array.from({ length: 400 }, (_, i) => `tool-number-${i}`);
    const out = serializeOrder({ cats: ["write", "convert"], tools: many }, 300);
    expect(out.length).toBeLessThanOrEqual(300);
    const back = parseOrder(out);
    expect(back.cats).toEqual(["write", "convert"]);
    expect(back.tools).toEqual(many.slice(0, back.tools.length));
    expect(back.tools.length).toBeGreaterThan(10);
    expect(back.tools.every((id) => /^tool-number-\d+$/.test(id))).toBe(true); // no half ids
  });
});

describe("sortByOrder", () => {
  const items = ["a", "b", "c", "d"].map((id) => ({ id }));
  it("saved ids first, the rest after in their own order", () => {
    expect(ids(sortByOrder(items, (i) => i.id, ["c", "a"]))).toEqual(["c", "a", "b", "d"]);
  });
  it("ignores ids that no longer exist and repeated ones", () => {
    expect(ids(sortByOrder(items, (i) => i.id, ["gone", "d", "d", "ghost", "b"]))).toEqual(["d", "b", "a", "c"]);
  });
  it("leaves the default alone with no saved order", () => {
    expect(ids(sortByOrder(items, (i) => i.id, []))).toEqual(["a", "b", "c", "d"]);
  });
});

describe("moving", () => {
  it("moves an item to a place", () => {
    expect(moveItem([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
    expect(moveItem([1, 2, 3, 4], 3, 0)).toEqual([4, 1, 2, 3]);
    expect(moveItem([1, 2, 3], 1, 1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 0, 9)).toEqual([2, 3, 1]);
  });
  it("steps one place and stops at the ends", () => {
    const l = ["a", "b", "c"];
    expect(moveBy(l, "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveBy(l, "b", 1)).toEqual(["a", "c", "b"]);
    expect(moveBy(l, "a", -1)).toBe(l);
    expect(moveBy(l, "c", 1)).toBe(l);
    expect(moveBy(l, "nope", 1)).toBe(l);
  });
});

describe("packGroups", () => {
  const g = (...sizes: number[]) => packGroups(sizes.map((size, i) => ({ id: String.fromCharCode(97 + i), size })));
  it("puts a one-tool and a two-tool category together", () => {
    expect(g(1, 2)).toEqual([["a", "b"]]);
    expect(g(1, 1, 1)).toEqual([["a", "b", "c"]]);
  });
  it("starts a new group when the next doesn't fit", () => {
    expect(g(2, 2)).toEqual([["a"], ["b"]]);
    expect(g(1, 1, 1, 1)).toEqual([["a", "b", "c"], ["d"]]);
  });
  it("lets a later small category fill a gap", () => {
    expect(g(2, 2, 1)).toEqual([["a", "c"], ["b"]]);
  });
  it("keeps a big category alone, and never moves anything across it", () => {
    expect(g(1, 4, 1, 2)).toEqual([["a"], ["b"], ["c", "d"]]);
    expect(g(3, 1)).toEqual([["a"], ["b"]]);
    expect(g(8)).toEqual([["a"]]);
  });
  it("is stable: packing a packed order changes nothing", () => {
    const sizes = [2, 1, 2, 1, 1, 4, 2, 2, 1, 1, 1, 2];
    const first = packGroups(sizes.map((size, i) => ({ id: `c${i}`, size })));
    const again = packGroups(first.flat().map((id) => ({ id, size: sizes[Number(id.slice(1))] })));
    expect(again).toEqual(first);
  });
  it("works with other capacities", () => {
    expect(packGroups([{ id: "a", size: 1 }, { id: "b", size: 1 }], 1)).toEqual([["a"], ["b"]]);
  });
});

describe("buildHome", () => {
  it("is the default order, with small categories packed, when nothing was arranged", () => {
    const v = buildHome(src, { cats: [], tools: [] });
    // write(2) convert(1) edit(1) inspect(1) utilities(4): write+convert, edit+inspect, utilities
    expect(v.groups).toEqual([["write", "convert"], ["edit", "inspect"], ["utilities"]]);
    expect(ids(v.categories)).toEqual(["write", "convert", "edit", "inspect", "utilities"]);
    expect(ids(v.toolsIn("utilities"))).toEqual(["a", "b", "c", "d"]);
  });
  it("applies a saved category and tool order", () => {
    const v = buildHome(src, { cats: ["utilities", "inspect"], tools: ["d", "b", "md"] });
    expect(ids(v.categories)).toEqual(["utilities", "inspect", "write", "convert", "edit"]);
    expect(ids(v.toolsIn("utilities"))).toEqual(["d", "b", "a", "c"]);
    expect(ids(v.toolsIn("write"))).toEqual(["md", "text"]);
  });
  it("puts new categories and tools at the end, in their default order", () => {
    const more = { categories: [...cats, { id: "fresh" }], tools: [...tools, tool("n1", "fresh"), tool("n2", "write")] };
    const v = buildHome(more, { cats: ["convert", "write"], tools: ["md", "text"] });
    expect(ids(v.categories).slice(0, 2)).toEqual(["convert", "write"]);
    expect(ids(v.categories).at(-1)).toBe("fresh");
    expect(ids(v.toolsIn("write"))).toEqual(["md", "text", "n2"]);
  });
  it("ignores ids that are gone and leaves no hole for a disabled addon", () => {
    const off = { categories: cats, tools: tools.filter((t) => t.category !== "convert") };
    const v = buildHome(off, { cats: ["convert", "gone", "edit"], tools: ["conv", "ghost", "hash"] });
    expect(ids(v.categories)).toEqual(["edit", "write", "inspect", "utilities"]);
    expect(v.groups.flat()).toEqual(ids(v.categories));
    expect(v.toolsIn("convert")).toEqual([]);
  });
  it("shows every category and tool exactly once whatever is saved", () => {
    const v = buildHome(src, { cats: ["edit", "edit", "write", "x"], tools: ["a", "a", "text", "text", "zz"] });
    expect(ids(v.categories).sort()).toEqual(cats.map((c) => c.id).sort());
    expect(v.categories.flatMap((c) => ids(v.toolsIn(c.id))).sort()).toEqual(tools.map((t) => t.id).sort());
  });
});

describe("saving a move", () => {
  it("keeps the other categories' tool order when one is rearranged", () => {
    const o1 = withToolOrder(src, { cats: [], tools: [] }, "utilities", ["d", "c", "b", "a"]);
    const o2 = withToolOrder(src, o1, "write", ["md", "text"]);
    const v = buildHome(src, o2);
    expect(ids(v.toolsIn("utilities"))).toEqual(["d", "c", "b", "a"]);
    expect(ids(v.toolsIn("write"))).toEqual(["md", "text"]);
    expect(parseOrder(serializeOrder(o2))).toEqual(o2);
  });
  it("saves the category order as shown", () => {
    const v = buildHome(src, withCategoryOrder({ cats: [], tools: [] }, ["utilities", "write", "convert", "edit", "inspect"]));
    expect(ids(v.categories)).toEqual(["utilities", "write", "convert", "edit", "inspect"]);
  });
});

describe("targetIndex", () => {
  const r = (left: number, top: number, w: number, h: number): Rect => ({ left, top, right: left + w, bottom: top + h });
  const grid = [r(0, 0, 100, 50), r(110, 0, 100, 50), r(0, 60, 100, 50), r(110, 60, 100, 50)];
  it("goes to the item under the pointer", () => {
    expect(targetIndex(grid, 0, { x: 150, y: 80 })).toBe(3);
    expect(targetIndex(grid, 3, { x: 20, y: 10 })).toBe(0);
  });
  it("stays when over its own slot", () => {
    expect(targetIndex(grid, 1, { x: 150, y: 20 })).toBe(1);
  });
  it("takes the nearest centre between items and outside the list", () => {
    expect(targetIndex(grid, 0, { x: 104, y: 80 })).toBe(2);
    expect(targetIndex(grid, 0, { x: 400, y: 5 })).toBe(1);
    expect(targetIndex(grid, 0, { x: -50, y: 500 })).toBe(2);
  });
});

describe("hiding", () => {
  const hsrc = {
    categories: [{ id: "a" }, { id: "b" }, { id: "c" }],
    tools: [
      { id: "a1", category: "a" }, { id: "a2", category: "a" },
      { id: "b1", category: "b" },
      { id: "c1", category: "c" }, { id: "c2", category: "c" },
    ],
  };
  it("leaves hidden tools and categories out", () => {
    const home = buildHome(hsrc, NO_ORDER, { cats: ["b"], tools: ["a2", "c1"] });
    expect(home.categories.map((c) => c.id)).toEqual(["a", "c"]);
    expect(home.toolsIn("a").map((t) => t.id)).toEqual(["a1"]);
    expect(home.toolsIn("c").map((t) => t.id)).toEqual(["c2"]);
  });
  it("drops a category once all of its tools are hidden", () => {
    const home = buildHome(hsrc, NO_ORDER, { cats: [], tools: ["b1"] });
    expect(home.categories.map((c) => c.id)).toEqual(["a", "c"]);
  });
  it("shows everything while editing, so it can be shown again", () => {
    const home = buildHome(hsrc, NO_ORDER, { cats: ["b"], tools: ["a2", "b1"] }, true);
    expect(home.categories.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(home.toolsIn("a").map((t) => t.id)).toEqual(["a1", "a2"]);
  });
  it("keeps hidden tools in the saved order, so they come back where they were", () => {
    const order = { cats: [], tools: ["a2", "a1"] };
    const next = withToolOrder(hsrc, order, "a", ["a1", "a2"]);
    expect(next.tools.filter((t) => t.startsWith("a"))).toEqual(["a1", "a2"]);
    const home = buildHome(hsrc, order, { cats: [], tools: ["a2"] }, true);
    expect(home.toolsIn("a").map((t) => t.id)).toEqual(["a2", "a1"]);
  });
  it("round-trips through the cookie format, with category and tool ids kept apart", () => {
    const h = { cats: ["convert"], tools: ["convert", "hash"] };
    expect(parseHidden(serializeHidden(h))).toEqual(h);
    expect(parseHidden("")).toEqual({ cats: [], tools: [] });
  });
});

describe("grouping", () => {
  const small = {
    categories: ["a", "b", "c", "d", "e"].map((id) => ({ id })),
    tools: [{ id: "a1", category: "a" }, { id: "b1", category: "b" }, { id: "c1", category: "c" }, { id: "d1", category: "d" }, { id: "e1", category: "e" }, { id: "e2", category: "e" }],
  };
  it("packs small categories into groups of three tiles, or six when wide", () => {
    expect(buildHome(small, NO_ORDER, NO_HIDDEN_FOR_TESTS, false, { capacity: 3 }).groups).toEqual([["a", "b", "c"], ["d", "e"]]);
    expect(buildHome(small, NO_ORDER, NO_HIDDEN_FOR_TESTS, false, { capacity: 6 }).groups).toEqual([["a", "b", "c", "d", "e"]]);
  });
  it("leaves every category on its own when grouping is off", () => {
    expect(buildHome(small, NO_ORDER, NO_HIDDEN_FOR_TESTS, false, { group: false }).groups).toEqual([["a"], ["b"], ["c"], ["d"], ["e"]]);
  });
  it("reads and writes the layout cookie", () => {
    expect(parseLayout("")).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout("g0w1")).toEqual({ group: false, wide: true });
    expect(parseLayout("junk")).toEqual(DEFAULT_LAYOUT);
    expect(serializeLayout(DEFAULT_LAYOUT)).toBe("");
    expect(parseLayout(serializeLayout({ group: true, wide: true }))).toEqual({ group: true, wide: true });
  });
});
const NO_HIDDEN_FOR_TESTS = { cats: [], tools: [] };

describe("favourites and tool colours", () => {
  it("round-trips favourites, dropping junk and repeats", () => {
    expect(parseFavs("text-editor,hash,text-editor,,bad id,<x>,regex")).toEqual(["text-editor", "hash", "regex"]);
    expect(parseFavs(undefined)).toEqual([]);
    expect(parseFavs(serializeFavs(["a", "b"]))).toEqual(["a", "b"]);
    expect(parseFavs(Array.from({ length: 200 }, (_, i) => `t${i}`).join(",")).length).toBe(60);
  });

  it("round-trips colours: a swatch hue stays on the wheel, an exact colour stays exact", () => {
    expect(parseHues("text-editor:250,hash:-20,regex:725,bad:x,none:,:12,sp ace:9,warm:FFAA00,short:abc,long:1234567")).toEqual({ "text-editor": "250", hash: "340", regex: "5", warm: "ffaa00" });
    expect(parseHues(serializeHues({ a: "10", b: "c8a2f0" }))).toEqual({ a: "10", b: "c8a2f0" });
    expect(parseHues("")).toEqual({});
    expect(isHueValue("25")).toBe(true);
    expect(isHueValue("c8a2f0")).toBe(false);
    expect(isHueValue(undefined)).toBe(false);
  });
});

describe("per-tool colours in lists", () => {
  it("tint: nothing stored keeps the category hue, a swatch replaces it, an exact colour keeps the hue and adds the hex", () => {
    expect(tint(undefined, 215)).toEqual({ hue: 215 });
    expect(tint("25", 215)).toEqual({ hue: 25 });
    expect(tint("c8a2f0", 215)).toEqual({ hue: 215, hex: "#c8a2f0" });
  });

  it("pinFavourites: starred tools first in star order, the rest unchanged", () => {
    const items = ["a", "b", "c", "d", "e"];
    expect(pinFavourites(items, (x) => x, ["d", "b"])).toEqual(["d", "b", "a", "c", "e"]);
    expect(pinFavourites(items, (x) => x, [])).toEqual(items);
    expect(pinFavourites(items, (x) => x, ["zzz", "c"])).toEqual(["c", "a", "b", "d", "e"]);
  });
});
