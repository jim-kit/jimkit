# Writing an addon

An addon adds tools (and optionally server routes) to Jimkit. People call them kits; see [kits.md](kits.md) for adding, publishing
and the registry. This page builds one, then lists the full contract. For the design
reasoning see [architecture.md](architecture.md).

## 1. Scaffold

```sh
node cli/jimkit.mjs addons new word-count
npm run dev                       # http://localhost:3000
```

That creates `addons/word-count/` with a working tool: open it from the home page (Utilities) and press *Ask the server*.

```
addons/word-count/
  package.json     the manifest, under "jimkit"
  src/client.ts    which component belongs to which tool
  src/Tool.tsx     the tool itself (React)
  src/server.ts    optional API routes
```

## 2. The manifest

`package.json` carries it, so Jimkit can read it without compiling your code:

```json
{
  "name": "@you/jimkit-addon-word-count",
  "jimkit": {
    "id": "word-count",
    "name": "Word count",
    "description": "Counts words, characters and lines.",
    "tools": [
      { "id": "word-count-tool", "category": "utilities", "name": "Word count",
        "blurb": "Counts words, characters and lines", "icon": "PenLine", "keywords": ["length", "stats"] }
    ],
    "fileActions": [
      { "id": "count-file", "tool": "word-count-tool", "label": "Count the words", "icon": "PenLine",
        "accept": { "ext": ["txt", "md"], "mime": ["text/*"] }, "priority": 10 }
    ],
    "server": true
  }
}
```

| Field | |
|---|---|
| `id` | 2 to 31 characters: a lowercase letter, then lowercase letters, digits and dashes. Unique. Namespaces your API (`/api/a/<id>/…`) and your data. |
| `tools[]` | each becomes a card on the home page and an entry in search. `category` is `write`, `convert`, `edit`, `inspect`, `utilities`, or one you declare in `categories[]`. `icon` is a [Lucide](https://lucide.dev) name the host knows, or one you register (below); `iconAnimation` picks how it moves (see [icons.md](icons.md), which lists every built-in icon). The tool's `id` is a lowercase letter, then up to 40 lowercase letters, digits and dashes, and unique across the install. `status: "soon"` lists it without opening. `trusted: true` limits it to trusted and unlocked visitors. |
| `fileActions[]` | "files like these can be opened by this tool": used by the drop-a-file chooser. Match by `ext` and/or `mime` (`*` matches everything). Higher `priority` is listed first. |
| `tools[].quick` | up to 6 ways to start a tool, shown in its ⋮ menu and in search: `{ "label": "New JSON document", "init": { "mode": "json" } }` opens the tool with that `init`. |
| `tools[].aliases` | old ids the tool still answers to, with the `init` each starts it with: `{ "markdown": { "mode": "markdown" } }`. Use it when you merge tools, so bookmarks, favourites and recents keep working. |
| `themes[]` | looks the addon brings: `{ id, name, blurb, layout?, flat?, order? }` (`flat: true` turns off the app's hover lifts and custom controls, see [themes.md](themes.md)), with a `src/theme.css` that restyles the page. An addon may have only themes (and `"tools": []`). See [themes.md](themes.md#making-a-theme-kit). |
| `categories[]` | `{ id, name, blurb, icon, hue }`: adds a section. |
| `system.apt` | Debian packages your server code runs. The `full` image installs the union of everyone's. |
| `env[]` | `{ name, description, default }`: documented environment variables, shown by `node cli/jimkit.mjs addons info`. |
| `settings[]` | options the owner changes in the Settings panel (below). |
| `server` | `true` if you have `src/server.ts`. |

### Settings

An addon can declare options; Settings then shows a section for it to trusted visitors.

```json
"settings": [
  { "key": "quality", "label": "Default quality", "type": "number", "default": 80, "min": 1, "max": 100 },
  { "key": "unit", "label": "Size unit", "type": "select", "default": "mb", "options": ["kb", "mb", { "value": "gb", "label": "Gigabytes" }] },
  { "key": "keepNames", "label": "Keep file names", "type": "boolean", "default": false, "help": "Off: results get a random name" },
  { "key": "footer", "label": "Footer text", "type": "text", "default": "", "maxLength": 80 }
]
```

| Field | |
|---|---|
| `key` | letters, digits and `_`; the name the value is stored and read under |
| `label`, `help` | the row's text; `help` is optional and should state a limit or a unit, not repeat the label |
| `type` | `boolean`, `number`, `text` or `select` |
| `default` | used until someone changes it; its kind must match `type` (a string for `text` and `select`) |
| `min`, `max` | numbers only; values outside are clamped |
| `maxLength` | text only; default 200 |
| `options` | select only; strings or `{ value, label }` |

Values are saved in `jimkit.config.json` under `addonConfig.<addon id>`. The server checks every save against the manifest: unknown
keys, wrong kinds and values that aren't a listed choice are refused (nothing is written), numbers are clamped. A malformed
declaration stops `gen-addons` with a message.

Read them in server code as `ctx.config.quality` (always current; defaults are filled in) and in a tool with
`useHost().settings("<addon id>")`. The browser values are visible to every visitor, so keep secrets in environment variables.

### Files in, files out

Two lists connect your tool to the others, and both go by file format.

**The formats your tool takes.** `fileActions` in the manifest is your tool's supported-types list. Every entry says "files like these can be opened here", matched by extension (`ext`, no dot, any case) and/or type (`mime`, with `text/*` and `*/*` wildcards; `"*"` matches everything):

```json
"fileActions": [
  { "id": "count-file", "tool": "word-count-tool", "label": "Count the words", "icon": "PenLine",
    "accept": { "ext": ["txt", "md", "rst"], "mime": ["text/*"] }, "priority": 10 }
]
```

When a visitor drops a file on the home screen, or presses "Send to…" in another tool, Jimkit lists every tool whose `accept` matches, best `priority` first, under your `label`. Your tool is then opened with the file in `init.files`. A file with no extension or an unknown one is matched by its type, so list both when you can: a file that was just made in the browser often has no type at all.

**Sending a file on.** If your tool makes something (a picture, a converted file, a list of values), let the visitor hand it to whichever tool takes it. Use the button from the UI kit:

```tsx
import { SendTo } from "@jimkit/ui";

<SendTo files={() => [new File([csv], "report.csv", { type: "text/csv" })]} as={{ name: "report.csv", type: "text/csv" }} />
```

- `files` is the files, or a function that makes them when the button is pressed (so nothing is built until it is wanted).
- `as` says what they will be called and typed. When no installed tool takes such a file the button hides itself, so there is never a button that opens an empty list. You can ask the same yourself: `host.canOffer([{ name: "report.csv", type: "text/csv" }])`.
- The list the visitor sees is the same one a dropped file gets, so a tool that declares `fileActions` for `csv` shows up in it for every kit that sends a CSV. Declare the formats you take, and other kits' output finds you.
- `host.offer(files)` is the plain call underneath, for your own button.
- To open one particular tool with a file, skip the list: `host.open("convert", { files: [file] })`.

## 3. The tool

```tsx
// src/Tool.tsx
"use client";
import type { ToolProps } from "@jimkit/sdk";
import { useHost } from "@jimkit/sdk/react";
import { Area, Pane, ToolFrame } from "@jimkit/ui";
import { useState } from "react";

export default function Tool({ tool, hue, init, onClose, mobile }: ToolProps) {
  const host = useHost();
  const [text, setText] = useState(init?.text ?? "");
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <ToolFrame title={tool.name} icon={tool.icon} hue={hue} onClose={onClose} mobile={mobile} subtitle={`${words} words`}>
      <div className="min-h-0 flex-1 p-3">
        <Pane title="Text" className="h-full"><Area label="Text" value={text} onChange={setText} /></Pane>
      </div>
    </ToolFrame>
  );
}
```

```ts
// src/client.ts: one lazy loader per tool; its code is only downloaded when someone opens it
import { defineClient } from "@jimkit/sdk";
export default defineClient({ tools: { "word-count-tool": () => import("./Tool") } });
```

What a tool receives (`ToolProps`): `tool` (its manifest entry), `hue` (its category colour, for `ToolFrame`/`Tile`), `init` (what it
was opened with: `files`, `text`, `name`, or your own fields), `mobile`, `onClose`.

`useHost()` gives you:

| | |
|---|---|
| `host.session` | tier (`trusted`/`unlocked`/`public`), limits, unlock expiry |
| `host.open(toolId, init)` | hand work to another tool, e.g. `host.open("convert", { files: [file] })` |
| `host.offer(files)` | hand files to the visitor's choice of tool: the same "What should happen to this?" list a dropped file gets, with every installed tool that takes them. Use it for a "Send to…" button on whatever your tool made. |
| `host.hasTool(toolId)` | whether it is installed and enabled. Offer "Convert" only when `hasTool("convert")` |
| `host.api(addon, path, init)` | `fetch` to your own server routes (same-origin, cookies included) |
| `host.storage(addon)` | `localStorage` namespaced to your addon; never throws |

`@jimkit/ui` has the building blocks (`ToolFrame`, `Btn`, `IconBtn`, `Seg`, `Chip`, `Menu`, `Sheet`, `Pane`, `Area`, `CopyBtn`,
`Tile`, `Icon`, `toast`, `copyText`, `downloadBlob`, `useFilePicker`, `useDebounced`, `formatBytes`). Build with the theme tokens
(`bg-surface`, `text-fg`, `border-line`, `bg-accent`, `rounded-xl`, never a hard-coded colour) and your tool follows every theme.
See [themes.md](themes.md). To add icons Jimkit doesn't have: `defineClient({ tools, icons: { MyIcon } })`.

Everything in a tool's `src/lib/` that is plain logic (no React, no DOM) can be unit-tested by importing it from `tests/*.test.ts`:
the first-party addons do exactly that.

## 4. The server

```ts
// src/server.ts
import { defineServer } from "@jimkit/sdk";

export default defineServer({
  // runs once at start-up. Open record collections here; probe for programs the addon needs.
  async onStart(ctx) {},
  // optional: tell the host whether the addon can work on this machine
  check: () => ({ ok: true }),
  routes: {
    "GET hello": ({ client }, ctx) => ctx.reply(client, { message: `hello, ${client.tier}` }),
    "POST items/:id": { minTier: "trusted", handler: async ({ req, params, client }, ctx) => ctx.reply(client, { id: params.id }) },
  },
});
```

Routes are mounted at `/api/a/<id>/…`. A handler receives `{ req, url, client, params }` and the addon's context `ctx`:

| `client` | `id` (random, from a cookie), `ip`, `tier`, `limits`, `expiresAt` |
|---|---|
| `ctx.reply(client, data, init)` / `ctx.fail(client, status, message)` | JSON responses with no-store and the client cookie attached |
| `ctx.records(name, { isBusy })` | a persistent collection: `get`, `all`, `put`, `touch`, `remove`, `dir(id)`. The host deletes records after the retention period, enforces the disk cap and counts bytes per address. Open them in `onStart`, then `await ctx.ready()` before reading. |
| `ctx.queue` | the host's job scheduler: `submit({ id, key, perKey, run(signal) })`, `cancel`, `position`. Respects the global and per-client concurrency settings. |
| `ctx.daily` | the daily-bytes allowance per address |
| `ctx.bytesHeldBy(ip)`, `ctx.retentionMs`, `ctx.engineThreads`, `ctx.dataDir`, `ctx.log` | |
| `ctx.config` | the addon's settings (see Settings). Read it when you need it: it follows a Settings save without a restart. |

Helpers for server code are in `@jimkit/sdk/server`: `run()` (execute a program with no shell, a minimal environment, a timeout that
kills the whole process group), `throttle()`, `safeBase()`, `matchPattern()`.

Rules the host enforces for you: non-GET requests must come from the app's own origin; `minTier` is checked before your handler runs;
an exception in a handler becomes a generic 500. Rules it can't enforce: validate every input, never put a user's file name in a
path, and treat every uploaded file as hostile (see how `addons/convert` runs engines).

`check()` is how an addon says "I can't work here": return `{ ok: false, reason: "ffmpeg is not installed. Use the full image." }`
and the tool shows as *Needs setup* with that reason instead of failing later. `{ ok: true, note: "…" }` is a working addon with a
limitation worth saying out loud.

### Testing the server

`@jimkit/sdk/testing` gives you a stand-in for the host, so route handlers can be tested without starting Jimkit:

```ts
// tests/notes.test.ts (run with vitest)
import { afterEach, expect, it } from "vitest";
import { callRoute, createTestContext, type TestContext } from "@jimkit/sdk/testing";
import server from "../src/server";

let t: TestContext;
afterEach(() => t.cleanup());

it("keeps a note for the client that wrote it", async () => {
  t = createTestContext({ addon: "notes" });
  const made = await callRoute(server, t, "POST", "notes", { json: { text: "hello" }, clientId: "a".repeat(32) });
  expect(made.status).toBe(201);
  const list = await callRoute(server, t, "GET", "notes", { clientId: "a".repeat(32) });
  expect(await list.json()).toEqual({ notes: ["hello"] });
});

it("keeps trusted-only routes closed to strangers", async () => {
  t = createTestContext();
  expect((await callRoute(server, t, "DELETE", "notes")).status).toBe(403);
  expect((await callRoute(server, t, "DELETE", "notes", { tier: "trusted" })).status).toBe(200);
});
```

`createTestContext({ addon, config, settings, retentionMs, engineThreads })` returns a `ServerContext` with:

- records kept in memory (their `dir(id)` is a real folder under a temporary data directory; `cleanup()` removes it),
- a queue that runs each task inline when you `submit` it (the global and per-client limits are not simulated),
- `daily` and `bytesHeldBy` working on those records,
- `ctx.config` from `config`; pass the manifest's `settings` to get defaults filled in as the host does,
- `ctx.logs`, every `ctx.log.*` call as `{ level, args }`,
- `reply` and `fail` as the host has them.

`callRoute(server, ctx, method, path, options)` finds the route the way the host does, refuses a client below the route's `minTier`,
and runs the handler. Options: `tier` (default `public`), `ip`, `clientId`, `client` (replaces parts of the client, e.g. `limits`),
`json`, `body`, `query` and `headers`. `HEAD` is answered by the `GET` route without a body. It does not run the same-origin check and
does not turn a thrown error into a 500: the error reaches your test. `TEST_LIMITS` holds the host's default limits per tier.

## 5. Trust, install, share

Addons run in the server process and the page. Only install ones you trust.

**From GitHub, while Jimkit runs** (the usual way): pack the addon, attach the file to a GitHub release, and people add it from the
Kits screen by pasting `you/your-repo`. [kits.md](kits.md) has the steps, the registry and what is checked on install.

```sh
node cli/jimkit.mjs kits pack addons/word-count     # dist/jimkit-kit.json
```

**Built into your own image** (for an addon that needs system packages, or that you don't want fetched at run time):

```sh
node cli/jimkit.mjs addons add @someone/jimkit-addon-thing     # an npm package, a git URL, or a folder
node cli/jimkit.mjs build --docker                             # custom image with it built in
```

An npm package named `jimkit-addon-<name>` (or scoped) with the manifest in `package.json` is found by `node cli/jimkit.mjs addons list`.
Peer-depend on `@jimkit/sdk`, `@jimkit/ui`, `react` and `lucide-react`. The SDK and UI kit are MIT, so your addon can use any license.

`node cli/jimkit.mjs kits list|info|new|pack|add|remove` (`addons` works too) and `node cli/jimkit.mjs doctor` help along the way. (The `jimkit` command the installer puts on your PATH is a different tool: it updates and removes the installed app. See [install.md](install.md#updating).)
