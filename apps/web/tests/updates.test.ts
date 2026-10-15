import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkForUpdate, readRelease, resetUpdateCache, updateSource } from "../src/core/updates";
import { appVersion, resetVersion } from "../src/core/version";

const gh = { kind: "github", repo: "a/b" } as const;
const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("where updates are looked for", () => {
  it("reads the setting", () => {
    expect(updateSource(undefined)).toEqual({ kind: "github", repo: "jim-kit/jimkit" });
    expect(updateSource("someone/fork")).toEqual({ kind: "github", repo: "someone/fork" });
    expect(updateSource("https://example.com/latest.json")).toEqual({ kind: "url", url: "https://example.com/latest.json" });
    expect(updateSource("off")).toBeNull();
    expect(updateSource("OFF")).toBeNull();
    expect(updateSource("")).toBeNull();
    expect(updateSource("http://insecure.example/latest.json")).toBeNull();
    expect(updateSource("not a repo")).toBeNull();
  });
});

describe("reading a release", () => {
  it("a GitHub release: the tag is the version, newer when it is ahead", () => {
    const r = readRelease(gh, { tag_name: "v0.2.0", html_url: "https://github.com/a/b/releases/tag/v0.2.0", body: "Faster.\n\n- a\n- b" }, "0.1.0");
    expect(r).toMatchObject({ latest: "0.2.0", newer: true, url: "https://github.com/a/b/releases/tag/v0.2.0", notes: "Faster.\n\n- a\n- b" });
  });
  it("is not newer when it is the same, older, or this is a dev build", () => {
    expect(readRelease(gh, { tag_name: "v0.1.0" }, "0.1.0").newer).toBe(false);
    expect(readRelease(gh, { tag_name: "v0.0.9" }, "0.1.0").newer).toBe(false);
    expect(readRelease(gh, { tag_name: "v9.9.9" }, "dev").newer).toBe(false);
  });
  it("a pre-release of the same number is older than the release", () => {
    expect(readRelease(gh, { tag_name: "v1.0.0" }, "1.0.0-rc.1").newer).toBe(true);
    expect(readRelease(gh, { tag_name: "v1.0.0-rc.2" }, "1.0.0").newer).toBe(false);
  });
  it("a URL source answers version, url and notes; only https links are kept", () => {
    const src = { kind: "url", url: "https://x.example/l.json" } as const;
    expect(readRelease(src, { version: "1.2.3", url: "https://x.example/n", notes: "hi" }, "1.0.0")).toMatchObject({ latest: "1.2.3", url: "https://x.example/n", notes: "hi", newer: true });
    expect(readRelease(src, { version: "1.2.3", url: "javascript:alert(1)" }, "1.0.0").url).toBeNull();
  });
  it("an answer without a usable version is an error, not an update", () => {
    for (const body of [null, {}, { tag_name: "latest" }, { tag_name: "nightly-3" }, "x"]) expect(readRelease(gh, body, "0.1.0")).toMatchObject({ latest: null, newer: false, error: expect.any(String) });
  });
  it("keeps release notes to a sensible length", () => {
    expect(readRelease(gh, { tag_name: "v0.2.0", body: "x".repeat(5000) }, "0.1.0").notes).toHaveLength(1500);
  });
});

describe("looking for an update", () => {
  beforeEach(() => { resetUpdateCache(); process.env.JIMKIT_VERSION = "0.1.0"; resetVersion(); });
  afterEach(() => { delete process.env.JIMKIT_VERSION; resetVersion(); });

  it("asks GitHub for the latest release and remembers the answer", async () => {
    const f = reply({ tag_name: "v0.2.0", html_url: "https://github.com/a/b/releases/tag/v0.2.0" });
    const first = await checkForUpdate({ fetchImpl: f as unknown as typeof fetch, value: "a/b", now: 1000 });
    expect(first).toMatchObject({ current: "0.1.0", latest: "0.2.0", newer: true, source: "a/b", checkedAt: 1000 });
    expect(f.mock.calls[0][0]).toBe("https://api.github.com/repos/a/b/releases/latest");
    await checkForUpdate({ fetchImpl: f as unknown as typeof fetch, value: "a/b", now: 1000 + 60 * 60 * 1000 });
    expect(f).toHaveBeenCalledTimes(1); // an hour later: the same answer
    await checkForUpdate({ fetchImpl: f as unknown as typeof fetch, value: "a/b", now: 1000 + 13 * 60 * 60 * 1000 });
    expect(f).toHaveBeenCalledTimes(2); // twelve hours on: ask again
  });
  it("looks again when asked to", async () => {
    const f = reply({ tag_name: "v0.2.0" });
    await checkForUpdate({ fetchImpl: f as unknown as typeof fetch, value: "a/b", now: 1 });
    await checkForUpdate({ fetchImpl: f as unknown as typeof fetch, value: "a/b", now: 2, force: true });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("says so when nothing has been released, and does not hammer the server after a failure", async () => {
    const f = reply({ message: "Not Found" }, 404);
    const a = await checkForUpdate({ fetchImpl: f as unknown as typeof fetch, value: "a/b", now: 0 });
    expect(a).toMatchObject({ latest: null, newer: false, error: expect.stringContaining("No release") });
    await checkForUpdate({ fetchImpl: f as unknown as typeof fetch, value: "a/b", now: 10 * 60 * 1000 });
    expect(f).toHaveBeenCalledTimes(1);
    await checkForUpdate({ fetchImpl: f as unknown as typeof fetch, value: "a/b", now: 31 * 60 * 1000 });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("survives a network failure", async () => {
    const f = vi.fn(async () => { throw new Error("offline"); });
    expect(await checkForUpdate({ fetchImpl: f as unknown as typeof fetch, value: "a/b", now: 0 })).toMatchObject({ latest: null, newer: false, error: expect.stringContaining("offline") });
  });
  it("does nothing at all when switched off", async () => {
    const f = reply({});
    expect(await checkForUpdate({ fetchImpl: f as unknown as typeof fetch, value: "off" })).toMatchObject({ source: null, latest: null, newer: false });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("the version", () => {
  afterEach(() => { delete process.env.JIMKIT_VERSION; resetVersion(); });
  it("can be set from the environment", () => {
    process.env.JIMKIT_VERSION = "9.8.7"; resetVersion();
    expect(appVersion()).toBe("9.8.7");
  });
  it("comes from package.json otherwise", () => {
    resetVersion();
    expect(appVersion()).toMatch(/^\d+\.\d+\.\d+|^dev$/);
  });
});
