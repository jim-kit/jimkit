import { afterEach, describe, expect, it } from "vitest";
import { defineServer, type BaseRecord } from "../src/index";
import { TEST_LIMITS, callRoute, createTestContext, type TestContext } from "../src/testing";

interface Note extends BaseRecord { text: string }

// a small addon to test: notes kept in a collection, one trusted-only route, one that uses the queue
const server = defineServer({
  routes: {
    "GET notes": ({ client }, ctx) => ctx.reply(client, { notes: ctx.records<Note>("notes").all().filter((n) => n.clientId === client.id).map((n) => n.text) }),
    "POST notes": async ({ req, client }, ctx) => {
      const body = (await req.json()) as { text?: unknown };
      if (typeof body.text !== "string" || !body.text) return ctx.fail(client, 400, "Write something.");
      const notes = ctx.records<Note>("notes");
      const id = `n${notes.all().length + 1}`;
      await notes.put({ id, clientId: client.id, ip: client.ip, created: Date.now(), bytes: body.text.length, text: body.text });
      ctx.log.info("saved", id);
      return ctx.reply(client, { id }, { status: 201 });
    },
    "GET notes/:id": ({ params, client }, ctx) => {
      const n = ctx.records<Note>("notes").get(params.id);
      return n ? ctx.reply(client, n) : ctx.fail(client, 404, "No such note.");
    },
    "DELETE notes": { minTier: "trusted", handler: ({ client }, ctx) => ctx.reply(client, { ok: true }) },
    "POST work": async ({ client }, ctx) => {
      let done = false;
      await ctx.queue.submit({ id: "job", key: client.ip, perKey: 1, run: async () => { done = true; } });
      return ctx.reply(client, { done, greeting: ctx.config.greeting });
    },
  },
});

let t: TestContext;
afterEach(() => t?.cleanup());

describe("createTestContext and callRoute", () => {
  it("runs a route against in-memory records", async () => {
    t = createTestContext({ addon: "notes" });
    const made = await callRoute(server, t, "POST", "notes", { json: { text: "hello" }, clientId: "a".repeat(32) });
    expect(made.status).toBe(201);
    const list = await callRoute(server, t, "GET", "notes", { clientId: "a".repeat(32) });
    expect(await list.json()).toEqual({ notes: ["hello"] });
    expect(await (await callRoute(server, t, "GET", "notes", { clientId: "b".repeat(32) })).json()).toEqual({ notes: [] });
    expect(t.logs).toEqual([{ level: "info", args: ["saved", "n1"] }]);
  });
  it("matches :params and answers 404 and 400 through ctx.fail", async () => {
    t = createTestContext();
    await callRoute(server, t, "POST", "notes", { json: { text: "x" } });
    expect((await (await callRoute(server, t, "GET", "notes/n1")).json()).text).toBe("x");
    expect((await callRoute(server, t, "GET", "notes/n9")).status).toBe(404);
    expect((await callRoute(server, t, "GET", "nope")).status).toBe(404);
    const bad = await callRoute(server, t, "POST", "notes", { json: { text: 3 } });
    expect([bad.status, await bad.json()]).toEqual([400, { error: "Write something." }]);
  });
  it("enforces minTier like the host", async () => {
    t = createTestContext();
    expect((await callRoute(server, t, "DELETE", "notes")).status).toBe(403);
    expect((await callRoute(server, t, "DELETE", "notes", { tier: "unlocked" })).status).toBe(403);
    expect((await callRoute(server, t, "DELETE", "notes", { tier: "trusted" })).status).toBe(200);
  });
  it("answers HEAD from the GET route without a body", async () => {
    t = createTestContext();
    const res = await callRoute(server, t, "HEAD", "notes");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });
  it("runs queued work inline and gives the addon its config, with settings defaults filled in", async () => {
    t = createTestContext({ settings: [{ key: "greeting", label: "Greeting", type: "text", default: "hi" }] });
    expect(await (await callRoute(server, t, "POST", "work")).json()).toEqual({ done: true, greeting: "hi" });
    t = createTestContext({ settings: [{ key: "greeting", label: "Greeting", type: "text", default: "hi" }], config: { greeting: "yo" } });
    expect((await (await callRoute(server, t, "POST", "work")).json()).greeting).toBe("yo");
  });
  it("counts bytes held per address and the daily allowance", async () => {
    t = createTestContext();
    await callRoute(server, t, "POST", "notes", { json: { text: "12345" }, ip: "192.0.2.5" });
    expect(t.bytesHeldBy("192.0.2.5")).toBe(5);
    expect(t.bytesHeldBy("192.0.2.6")).toBe(0);
    expect(t.daily.canUse("192.0.2.5", 10, 10)).toBe(true);
    t.daily.add("192.0.2.5", 8);
    expect(t.daily.canUse("192.0.2.5", 10, 10)).toBe(false);
    expect(t.daily.canUse("192.0.2.5", 10, null)).toBe(true);
  });
  it("lets a test replace the client's limits", async () => {
    t = createTestContext();
    const probe = defineServer({ routes: { "GET limits": ({ client }, ctx) => ctx.reply(client, client.limits) } });
    const res = await callRoute(probe, t, "GET", "limits", { client: { limits: { ...TEST_LIMITS.public, maxFiles: 1 } } });
    expect((await res.json()).maxFiles).toBe(1);
  });
  it("sends bodies and query strings", async () => {
    t = createTestContext();
    const echo = defineServer({ routes: { "POST echo": async ({ req, url, client }, ctx) => ctx.reply(client, { q: url.searchParams.get("a"), b: url.searchParams.get("b"), text: await req.text() }) } });
    const res = await callRoute(echo, t, "POST", "echo?a=1", { query: { b: "2" }, body: "raw" });
    expect(await res.json()).toEqual({ q: "1", b: "2", text: "raw" });
  });
});
