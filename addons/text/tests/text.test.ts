import { describe, expect, it } from "vitest";
import { renderMarkdown, inline } from "../src/lib/markdown";
import { TooDifferent, diff, diffText, wordParts } from "../src/lib/diff";
import * as T from "../src/lib/transforms";
import { format, minify, parseJson, parseYaml, sniff } from "../src/lib/data";
import * as E from "../src/lib/encode";
import { queryPath } from "../src/lib/query";
import * as M from "../src/lib/mdedit";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("markdown", () => {
  it("renders the basics", () => {
    const h = renderMarkdown("# Title\n\nSome **bold**, *it* and `code`.\n\n- a\n- b\n\n1. one\n2. two\n\n> quote\n\n---");
    expect(h).toContain("<h1>Title</h1>");
    expect(h).toContain("<strong>bold</strong>");
    expect(h).toContain("<em>it</em>");
    expect(h).toContain("<code>code</code>");
    expect(h).toContain("<ul><li>a</li><li>b</li></ul>");
    expect(h).toContain("<ol><li>one</li><li>two</li></ol>");
    expect(h).toContain("<blockquote><p>quote</p></blockquote>");
    expect(h).toContain("<hr>");
  });
  it("never lets raw HTML or script URLs through", () => {
    const h = renderMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1)) [y](data:text/html,hi) ![i](https://evil.example/p.png) <img src=x onerror=alert(1)>');
    expect(h).not.toContain("<script");
    expect(h).not.toContain("<img");
    expect(h).not.toMatch(/href="javascript/i);
    expect(h).not.toMatch(/href="data/i);
    expect(h).toContain("&lt;script&gt;");
    expect(h).toContain('rel="noopener noreferrer nofollow"');
  });
  it("keeps code content literal", () => {
    expect(inline("`*not em* <b>`")).toBe("<code>*not em* &lt;b&gt;</code>");
    const h = renderMarkdown("```js\nconst a = '<b>' * 2;\n```");
    expect(h).toContain('class="lang-js"');
    expect(h).toContain("&lt;b&gt;");
    expect(h).not.toContain("<em>");
  });
  it("renders tables, task lists and nested lists", () => {
    const t = renderMarkdown("| a | b |\n|:--|--:|\n| 1 | 2 |");
    expect(t).toContain("<table>");
    expect(t).toContain('<th style="text-align:left">a</th>');
    expect(t).toContain('<td style="text-align:right">2</td>');
    const l = renderMarkdown("- [x] done\n- [ ] todo\n  - nested");
    expect(l).toContain('<input type="checkbox" disabled checked>');
    expect(l).toContain("<ul><li>nested</li></ul>");
  });
  it("keeps a code span inside link text", () => {
    expect(inline("[`npm i`](https://example.com)")).toBe('<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow"><code>npm i</code></a>');
    // NUL is the placeholder character; typing it can't forge a placeholder
    expect(inline("[\u00000\u0000](https://example.com)")).toBe('<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">0</a>');
  });
  it("links bare URLs but only http(s)", () => {
    expect(inline("see https://example.com/a?b=1.")).toContain('<a href="https://example.com/a?b=1"');
    expect(inline("see ftp://example.com")).not.toContain("<a");
  });
});

describe("diff", () => {
  const apply = (a: string[], b: string[]) => diff(a, b).filter((o) => o.t !== "add").map((o) => o.v).join() === a.join() && diff(a, b).filter((o) => o.t !== "del").map((o) => o.v).join() === b.join();
  it("reconstructs both sides for fixed cases", () => {
    expect(apply([], [])).toBe(true);
    expect(apply(["a"], [])).toBe(true);
    expect(apply([], ["a"])).toBe(true);
    expect(apply(["a", "b", "c"], ["a", "x", "c"])).toBe(true);
    expect(apply("ABCABBA".split(""), "CBABAC".split(""))).toBe(true);
  });
  it("reconstructs both sides for random inputs and finds a minimal-ish script", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let n = 0; n < 200; n++) {
      const a = Array.from({ length: Math.floor(rnd() * 25) }, () => String.fromCharCode(97 + Math.floor(rnd() * 4)));
      const b = Array.from({ length: Math.floor(rnd() * 25) }, () => String.fromCharCode(97 + Math.floor(rnd() * 4)));
      expect(apply(a, b)).toBe(true);
    }
    const d = diff("ABCABBA".split(""), "CBABAC".split(""));
    expect(d.filter((o) => o.t !== "eq").length).toBe(5); // Myers' paper example: D = 5
  });
  it("keeps the frontier trace small and gives the same script when the linear-space search is used instead", () => {
    let seed = 3;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let n = 0; n < 300; n++) {
      const al = 2 + Math.floor(rnd() * 5);
      const mk = () => Array.from({ length: Math.floor(rnd() * 50) }, () => String.fromCharCode(97 + Math.floor(rnd() * al)));
      const a = mk(), b = mk();
      const base = diff(a, b);
      const lin = diff(a, b, undefined, { traceCells: 0 });
      expect(lin.filter((o) => o.t !== "eq").length).toBe(base.filter((o) => o.t !== "eq").length);
      expect(lin.filter((o) => o.t !== "add").map((o) => o.v).join("")).toBe(a.join(""));
      expect(lin.filter((o) => o.t !== "del").map((o) => o.v).join("")).toBe(b.join(""));
    }
  });
  it("diffs two completely different 6000-line texts without a huge trace", () => {
    const side = (p: string) => Array.from({ length: 6000 }, (_, i) => `${p} ${i}`).join("\n");
    const r = diffText(side("alpha"), side("beta"));
    expect(r.tooDifferent).toBeUndefined();
    expect(r.changed).toBe(6000);
  });
  it("gives up with a coarse result when the work limit is hit", () => {
    const a = Array.from({ length: 300 }, (_, i) => `a${i}`), b = Array.from({ length: 300 }, (_, i) => `b${i}`);
    expect(() => diff(a, b, undefined, { traceCells: 0, steps: 1000 })).toThrow(TooDifferent);
    const r = diffText(["head", ...a, "tail"].join("\n"), ["head", ...b, "tail"].join("\n"), {}, { traceCells: 0, steps: 1000 });
    expect(r.tooDifferent).toBe(true);
    expect(r.rows[0].kind).toBe("eq");
    expect(r.rows[r.rows.length - 1].kind).toBe("eq");
    expect([r.removed, r.added]).toEqual([300, 300]);
  });
  it("pairs changed lines and highlights words", () => {
    const r = diffText("one\nthe quick fox\nthree", "one\nthe slow fox\nthree\nfour");
    expect(r.rows.map((x) => x.kind)).toEqual(["eq", "change", "eq", "add"]);
    expect(r.changed).toBe(1);
    expect(r.added).toBe(1);
    const p = wordParts("the quick fox", "the slow fox");
    expect(p.left.filter((x) => x.changed).map((x) => x.text)).toEqual(["quick"]);
    expect(p.right.filter((x) => x.changed).map((x) => x.text)).toEqual(["slow"]);
  });
  it("can ignore case and whitespace, and says when nothing differs", () => {
    expect(diffText("Hello  World", "hello world", { ignoreCase: true, ignoreSpace: true }).same).toBe(true);
    expect(diffText("Hello", "hello").same).toBe(false);
    expect(diffText("", "").same).toBe(true);
  });
});

describe("transforms", () => {
  it("counts exactly like the plain formulas do, on awkward text", () => {
    const naive = (text: string) => {
      const trimmed = text.trim();
      return {
        chars: [...text].length, charsNoSpace: [...text.replace(/\s/g, "")].length, words: trimmed ? trimmed.split(/\s+/).length : 0,
        lines: text === "" ? 0 : text.split(/\r\n|\r|\n/).length, paragraphs: trimmed ? trimmed.split(/\n\s*\n/).length : 0, bytes: bytes(text).length,
      };
    };
    const pool = ["a", "b", " ", " ", "\n", "\n", "\r", "\r\n", "\t", "\u00a0", "\u3000", "é", "漢", "😀", "\ud800", "\n \n", "\ufeff"];
    let seed = 5;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let n = 0; n < 2000; n++) {
      const text = Array.from({ length: Math.floor(rnd() * 30) }, () => pool[Math.floor(rnd() * pool.length)]).join("");
      const { readMinutes, ...got } = T.stats(text);
      expect(got, JSON.stringify(text)).toEqual(naive(text));
      expect(readMinutes).toBeCloseTo(naive(text).words / 230);
    }
  });
  it("counts", () => {
    const s = T.stats("Hello wörld\n\nSecond paragraph here.\n");
    expect(s.words).toBe(5);
    expect(s.paragraphs).toBe(2);
    expect(s.lines).toBe(4);
    expect(s.bytes).toBe(bytes("Hello wörld\n\nSecond paragraph here.\n").length);
    expect(T.stats("").words).toBe(0);
  });
  it("sorts, dedupes and keeps the final newline", () => {
    expect(T.sortLines("b\na\nc\n")).toBe("a\nb\nc\n");
    expect(T.sortLines("b\na\nc", { desc: true })).toBe("c\nb\na");
    expect(T.sortLines("10\n9\n100", { numeric: true })).toBe("9\n10\n100");
    expect(T.dedupeLines("a\nb\na\nb\nc")).toBe("a\nb\nc");
    expect(T.reverseLines("1\n2\n3")).toBe("3\n2\n1");
    expect(T.removeBlankLines("a\n\n  \nb")).toBe("a\nb");
  });
  it("splits words at separators, humps, acronyms and keeps letters and digits together", () => {
    expect(T.words("some_thing-else here")).toEqual(["some", "thing", "else", "here"]);
    expect(T.words("XMLHttpRequest")).toEqual(["XML", "Http", "Request"]);
    expect(T.words("parseHTTPResponse2Go")).toEqual(["parse", "HTTP", "Response2", "Go"]);
    expect(T.words("md5Hash")).toEqual(["md5", "Hash"]);
    expect(T.words("naïveÉtat")).toEqual(["naïve", "État"]);
  });

  it("converts each line on its own", () => {
    expect(T.snakeCase("fooBar\nbazQux")).toBe("foo_bar\nbaz_qux");
    expect(T.camelCase("  some_thing\r\n\r\nother thing  ")).toBe("  someThing\r\n\r\notherThing  ");
    expect(T.constantCase("HTTPServer")).toBe("HTTP_SERVER");
    expect(T.dotCase("someThing")).toBe("some.thing");
  });

  it("keeps the words through upper and lower case, so conversions can be chained", () => {
    let mem: T.CaseMemory | undefined;
    const step = (text: string, style: T.CaseStyle) => { const r = T.convertCase(text, style, mem); mem = r.memory; return r.text; };
    let t = step("some_thing\nother_name", "camel");
    expect(t).toBe("someThing\notherName");
    t = step(t, "lower");
    expect(t).toBe("something\nothername");
    expect(step(t, "snake")).toBe("some_thing\nother_name");
    t = step("some_thing\nother_name", "upper");
    expect(t).toBe("SOME_THING\nOTHER_NAME");
    t = step("someThing", "camel"); t = step(t, "upper"); t = step(t, "lower");
    expect(step(t, "kebab")).toBe("some-thing");
    expect(step("someThing", "title")).toBe("Some Thing");
    expect(step("someThing", "lower")).toBe("something");
    expect(step("something", "pascal")).toBe("SomeThing");
  });

  it("forgets the words as soon as the text is different", () => {
    const first = T.convertCase("some_thing", "lower");
    expect(first.text).toBe("some_thing");
    const flat = T.convertCase("someThing", "lower");
    expect(T.convertCase("something", "snake", flat.memory).text).toBe("some_thing");
    expect(T.convertCase("something else", "snake", flat.memory).text).toBe("something_else");
    expect(T.convertCase("something", "snake").text).toBe("something");
    expect(T.convertCase("something\nmore", "snake", flat.memory).text).toBe("something\nmore");
  });

  it("title and sentence case leave ordinary sentences alone but split names", () => {
    expect(T.convertCase("the QUICK brown fox. it ran", "title").text).toBe("The Quick Brown Fox. It Ran");
    expect(T.convertCase("hello. WORLD is here! ok", "sentence").text).toBe("Hello. World is here! Ok");
    expect(T.convertCase("user_first_name", "sentence").text).toBe("User first name");
  });

  it("converts case", () => {
    expect(T.camelCase("hello big_world-now")).toBe("helloBigWorldNow");
    expect(T.pascalCase("hello big world")).toBe("HelloBigWorld");
    expect(T.snakeCase("helloBigWorld")).toBe("hello_big_world");
    expect(T.kebabCase("Hello Big World")).toBe("hello-big-world");
    expect(T.titleCase("the QUICK brown fox")).toBe("The Quick Brown Fox");
    expect(T.sentenceCase("hello. WORLD is here! ok")).toBe("Hello. World is here! Ok");
    expect(T.slugify("Héllo, Wörld!  2026")).toBe("hello-world-2026");
  });
  it("wraps without splitting words", () => {
    expect(T.wrapLines("aaa bbb ccc ddd", 7)).toBe("aaa bbb\nccc ddd");
    expect(T.wrapLines("short", 80)).toBe("short");
  });
  it("finds and replaces, plain and regex", () => {
    expect(T.findAll("a.b a.b", "a.b").matches.length).toBe(2);
    expect(T.findAll("aXb axb", "a.b", { regex: true, caseSensitive: true }).matches.length).toBe(2);
    expect(T.findAll("Cat cat", "cat", { caseSensitive: true }).matches.length).toBe(1);
    expect(T.findAll("cat concat", "cat", { wholeWord: true }).matches.length).toBe(1);
    expect(T.findAll("x", "(", { regex: true }).error).toBeTruthy();
    expect(T.replaceAll("2026-10-02", "(\\d+)-(\\d+)-(\\d+)", "$3/$2/$1", { regex: true })).toMatchObject({ text: "02/10/2026", count: 1 });
    expect(T.replaceAll("a.b", "a.b", "$&$&")).toMatchObject({ text: "$&$&" });
    expect(T.replaceAll("one two", "o", "0")).toMatchObject({ text: "0ne tw0", count: 2 });
  });
  it("picks modes from file names", () => {
    expect(T.modeFor("notes.md")).toBe("markdown");
    expect(T.modeFor("a.json")).toBe("json");
    expect(T.modeFor("a.py")).toBe("code");
    expect(T.modeFor("a.bin")).toBe("plain");
    expect(T.isTextFile("x.log")).toBe(true);
    expect(T.isTextFile("x.png", "image/png")).toBe(false);
  });
});

describe("json and yaml", () => {
  it("formats, minifies and reports where it broke", () => {
    expect(format('{"b":1,"a":[1,2]}', "json", "json", { indent: 2 })).toEqual({ ok: true, text: '{\n  "b": 1,\n  "a": [\n    1,\n    2\n  ]\n}\n' });
    expect(format('{"b":1,"a":2}', "json", "json", { sortKeys: true })).toMatchObject({ ok: true, text: expect.stringMatching(/"a": 2,\n  "b": 1/) });
    expect(minify('{\n "a": 1,\n "b": [1, 2]\n}')).toEqual({ ok: true, text: '{"a":1,"b":[1,2]}' });
    const bad = parseJson('{\n  "a": 1,\n  "b": }');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.line).toBe(3);
  });
  it("converts between JSON and YAML both ways", () => {
    const y = format('{"name":"x","list":[1,2],"n":{"a":true}}', "json", "yaml");
    expect(y).toEqual({ ok: true, text: "name: x\nlist:\n  - 1\n  - 2\nn:\n  a: true\n" });
    const j = format("name: x\nlist:\n  - 1\n  - 2\n", "yaml", "json", { indent: 2 });
    expect(j.ok && JSON.parse(j.text)).toEqual({ name: "x", list: [1, 2] });
    expect(parseYaml("a: [1, 2").ok).toBe(false);
    expect(sniff('  {"a":1}')).toBe("json");
    expect(sniff("a: 1")).toBe("yaml");
  });
});

describe("encoders", () => {
  const roundtrip = (enc: (s: string) => E.R, dec: (s: string) => E.R, s: string) => { const e = enc(s); return e.ok && dec(e.text); };
  it("round-trips unicode text through every pair", () => {
    const s = "héllo wörld ✓ 日本語 🚀 <a href=\"x\">&</a>\n\ttab";
    for (const m of E.MODES) if (m.enc) expect(roundtrip(m.enc, m.dec, s), m.id).toEqual({ ok: true, text: s });
  });
  it("matches known encodings", () => {
    expect(E.toBase64("hello")).toEqual({ ok: true, text: "aGVsbG8=" });
    expect(E.toBase64("??>>", true)).toEqual({ ok: true, text: "Pz8-Pg" });
    expect(E.fromBase64("Pz8-Pg")).toEqual({ ok: true, text: "??>>" });
    expect(E.toUrl("a b&c=d/é")).toEqual({ ok: true, text: "a%20b%26c%3Dd%2F%C3%A9" });
    expect(E.toHex("Hi")).toEqual({ ok: true, text: "48 69" });
    expect(E.fromHtml("&lt;p&gt; &amp; &copy; &#65; &#x1F680;")).toEqual({ ok: true, text: "<p> & © A 🚀" });
    expect(E.rot13("Hello")).toEqual({ ok: true, text: "Uryyb" });
  });
  it("explains bad input instead of throwing", () => {
    expect(E.fromBase64("***").ok).toBe(false);
    expect(E.fromHex("abc").ok).toBe(false);
    expect(E.fromUrl("%E0%A4%A").ok).toBe(false);
    expect(E.fromBinary("0101").ok).toBe(false);
    expect(E.jwt("nope").ok).toBe(false);
  });
  it("decodes a JWT and does not claim to verify it", () => {
    const j = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4iLCJpYXQiOjE1MTYyMzkwMjJ9.sig";
    const r = E.jwt(j);
    expect(r.ok && r.text).toContain('"name": "John"');
    expect(r.ok && r.text).toContain("iat: 2018-01-18T01:30:22.000Z");
    expect(r.ok && r.text).toContain("not verified");
  });
});

describe("json path", () => {
  const doc = { name: "kit", tags: ["a", "b", "c"], limits: { public: "2 GB", lan: "5 GB" }, list: [{ id: 1, x: { id: 9 } }, { id: 2 }], "odd key": true };
  const q = (p: string) => { const r = queryPath(doc, p); return r.ok ? r.matches : r.message; };
  it("walks keys, indexes, wildcards and slices", () => {
    expect(q("$")).toEqual([doc]);
    expect(q("$.name")).toEqual(["kit"]);
    expect(q("$.limits.lan")).toEqual(["5 GB"]);
    expect(q("$['odd key']")).toEqual([true]);
    expect(q('$["limits"]["public"]')).toEqual(["2 GB"]);
    expect(q("$.tags[0]")).toEqual(["a"]);
    expect(q("$.tags[-1]")).toEqual(["c"]);
    expect(q("$.tags[*]")).toEqual(["a", "b", "c"]);
    expect(q("$.tags[1:]")).toEqual(["b", "c"]);
    expect(q("$.limits.*")).toEqual(["2 GB", "5 GB"]);
    expect(q("$.list[*].id")).toEqual([1, 2]);
  });
  it("searches all levels with ..", () => {
    expect(q("$..id")).toEqual([1, 9, 2]);
    expect(q("$.list..id")).toEqual([1, 9, 2]);
    expect(q("$..[0]")).toEqual(["a", { id: 1, x: { id: 9 } }]);
  });
  it("returns nothing for a missing path and explains a malformed one", () => {
    expect(q("$.nope.deeper")).toEqual([]);
    expect(q("$.tags[9]")).toEqual([]);
    expect(q("name")).toBe("A path starts with $");
    expect(q("$.tags[")).toBe("Missing ]");
    expect(q("$.tags[x]")).toBe("Can't read [x]");
  });
});

describe("markdown editing", () => {
  const apply = (v: string, e: M.Edit) => v.slice(0, e.start) + e.text + v.slice(e.end);
  it("wraps and unwraps a selection", () => {
    const e = M.wrap("say hello now", 4, 9, "**", "bold");
    expect(apply("say hello now", e)).toBe("say **hello** now");
    expect(e.selFrom).toBe(6);
    expect(e.selTo).toBe(11);
    // select what is inside the marks and press again: they come off
    const u = M.wrap("say **hello** now", 6, 11, "**", "bold");
    expect(apply("say **hello** now", u)).toBe("say hello now");
    expect(apply("", M.wrap("", 0, 0, "*", "italic"))).toBe("*italic*");
  });
  it("makes links", () => {
    expect(apply("see docs", M.link("see docs", 4, 8))).toBe("see [docs](url)");
    const e = M.link("see docs", 4, 8);
    expect(apply("see docs", e).slice(e.selFrom, e.selTo)).toBe("url");
    expect(apply("https://x.org/a", M.link("https://x.org/a", 0, 15))).toBe("[link](https://x.org/a)");
  });
  it("toggles lists over every touched line", () => {
    const v = "one\ntwo\nthree";
    expect(apply(v, M.list(v, 1, 6, false))).toBe("- one\n- two\nthree");
    expect(apply(v, M.list(v, 0, v.length, true))).toBe("1. one\n2. two\n3. three");
    expect(apply("- a\n- b", M.list("- a\n- b", 0, 7, false))).toBe("a\nb");
    expect(apply("- a\nb", M.list("- a\nb", 0, 5, true))).toBe("1. a\n2. b");
  });
  it("uses inline code for one line and a fence for several", () => {
    expect(apply("run ls now", M.code("run ls now", 4, 6))).toBe("run `ls` now");
    expect(apply("a\nb", M.code("a\nb", 0, 3))).toBe("```\na\nb\n```");
  });
  it("sets and clears headings", () => {
    expect(apply("Title", M.heading("Title", 2, 2))).toBe("## Title");
    expect(apply("# Title", M.heading("# Title", 2, 2))).toBe("## Title");
    expect(apply("## Title", M.heading("## Title", 2, 2))).toBe("Title");
  });
  it("builds a standalone page", () => {
    const h = M.htmlDocument('A "b" <c>', "<p>hi</p>");
    expect(h).toContain("<title>A &quot;b&quot; &lt;c&gt;</title>");
    expect(h).toContain("<body>\n<p>hi</p>\n</body>");
    expect(h.startsWith("<!doctype html>")).toBe(true);
  });
});
