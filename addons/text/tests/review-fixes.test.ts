import { describe, expect, it } from "vitest";
import { format, minify } from "../src/lib/data";
import { fromUnicode, jwt, toUrl } from "../src/lib/encode";
import { renderMarkdown as render } from "../src/lib/markdown";

describe("JSON formatting keeps the numbers as written", () => {
  it("does not round a long integer or drop a .0", () => {
    const r = format('{"id":12345678901234567890,"price":1.0,"tiny":1e-7,"neg":-0.50}', "json", "json");
    expect(r.ok && r.text).toBe('{\n  "id": 12345678901234567890,\n  "price": 1.0,\n  "tiny": 1e-7,\n  "neg": -0.50\n}\n');
  });
  it("minifies the same way", () => {
    const r = minify('{ "id": 12345678901234567890 , "list": [ 1.0, 2, "a b" ] }');
    expect(r.ok && r.text).toBe('{"id":12345678901234567890,"list":[1.0,2,"a b"]}');
  });
  it("keeps strings as written, including escapes", () => {
    const r = minify('{"s":"a\\u00e9\\n\\"q\\""}');
    expect(r.ok && r.text).toBe('{"s":"a\\u00e9\\n\\"q\\""}');
  });
  it("indents with four spaces or a tab, empties stay empty, and keys can be sorted", () => {
    expect((format('{"b":[],"a":{}}', "json", "json", { indent: 4, sortKeys: true }) as { text: string }).text).toBe('{\n    "a": {},\n    "b": []\n}\n');
    expect((format('{"a":[1]}', "json", "json", { indent: "tab" }) as { text: string }).text).toBe('{\n\t"a": [\n\t\t1\n\t]\n}\n');
  });
  it("still reports a syntax error", () => {
    expect(format('{"a":', "json", "json").ok).toBe(false);
    expect(minify("{oops}").ok).toBe(false);
  });
});

describe("the encoders say so instead of throwing", () => {
  it("a lone surrogate can't be URL-encoded", () => {
    expect(toUrl("a\ud83d")).toMatchObject({ ok: false });
    expect(toUrl("a b")).toEqual({ ok: true, text: "a%20b" });
  });
  it("a code point past Unicode is left as typed", () => {
    expect(fromUnicode("\\u{110000} \\u{1f600}")).toMatchObject({ ok: true, text: "\\u{110000} \u{1f600}" });
  });
  it("a JWT with a date beyond what a Date can hold still decodes", () => {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const r = jwt(`${b64({ alg: "none" })}.${b64({ exp: 99999999999999 })}.`);
    expect(r).toMatchObject({ ok: true });
    expect((r as { text: string }).text).toContain("exp: not a date");
  });
});

describe("Markdown headings", () => {
  it("keep a # that is part of the title", () => {
    expect(render("# Learning C#")).toContain("<h1>Learning C#</h1>");
    expect(render("## F# and C++ ##")).toContain("<h2>F# and C++</h2>");
  });
});

import { findAll, replacementAt } from "../src/lib/transforms";

describe("replacing a single match", () => {
  it("sees what is around it: look-behind, look-ahead and word boundaries", () => {
    expect(replacementAt("ab", "(?<=a)b", "[$&]", { regex: true }, 1)).toBe("[b]");
    expect(replacementAt("foo.bar", "foo(?=\\.)", "<$&>", { regex: true }, 0)).toBe("<foo>");
    expect(replacementAt("cat concat", "cat", "dog", { wholeWord: true }, 0)).toBe("dog");
  });
  it("expands $1 and named groups", () => {
    expect(replacementAt("2026-10-14", "(\\d+)-(\\d+)-(\\d+)", "$3/$2/$1", { regex: true }, 0)).toBe("14/10/2026");
    expect(replacementAt("a=1", "(?<k>\\w)=(?<v>\\d)", "$<v>=$<k>", { regex: true }, 0)).toBe("1=a");
  });
  it("uses the replacement as typed when the search is plain text", () => {
    expect(replacementAt("a.b", ".", "$&", {}, 1)).toBe("$&");
  });
  it("is null where no match starts", () => {
    expect(replacementAt("abc", "b", "x", {}, 0)).toBeNull();
    expect(findAll("abc", "b").matches[0].index).toBe(1);
  });
});
