# Architecture

How Jimkit is put together, for people who want to read or change the code. For writing a kit, start with
[addons.md](addons.md); for running Jimkit, with [install.md](install.md).

## The shape

Jimkit is one Next.js app (`apps/web`) that hosts **kits**. A kit is a folder under `addons/` (the code calls it an addon) that adds
tools, a look, or both. The home screen, the command bar, the session, limits, settings and the update check belong to the app.
Everything you actually do with a file belongs to a kit.

```
apps/web/        the app: pages, API routes, core services, shell UI
apps/site/       the website and docs (a static export; not part of the app)
packages/sdk/    @jimkit/sdk (MIT): types and helpers a kit compiles against
packages/ui/     @jimkit/ui (MIT): design tokens, controls, menus, tool frame, icons
packages/pack/   jimkit-pack (MIT): builds and checks a kit's bundle file
addons/          the built-in kits: text, devtools, hash, image, convert, theme-paper, theme-glass, theme-metro
cli/jimkit.mjs   kits (list, info, add, remove, new, pack), apt, doctor, unlock-hash, build
install/         install.sh (Docker), proxmox-lxc.sh (LXC), the `jimkit` command (update, status, logs, restart, delete)
docker/          the image
```

Kits import only `@jimkit/sdk`, `@jimkit/ui`, `react`, `lucide-react` and their own files. The app reaches a kit only through a
generated registry (`apps/web/src/generated`, written by `scripts/gen-addons.mjs`), never by importing it. The packages never import
from the apps.

## A kit

A kit's `package.json` has a `jimkit` field: its id, the tools it adds (id, name, category, icon, the file types it takes), the themes
it adds, and what it needs from the system. It has up to three code files:

- **client**: `defineClient({ tools, layouts })`. React components for each tool, and for a theme that brings its own layout.
- **server**: `defineServer({ routes, onStart })`. Routes under `/api/a/<kit>/…`, with a data folder of their own.
- **theme.css**: tokens and rules for a theme, scoped to its own `data-theme` value.

Built-in kits are compiled into the app. A kit you add while Jimkit runs is one JSON file (`jimkit-kit.json`) that holds the same
files as text. The app validates it, checks it against the registry's hash, stores it under the data folder and loads the client
file in the page and the server file inside the process. See [kits.md](kits.md) for what that trusts.

Tools talk to the app through `useHost()`: open another tool, offer a file to the tools that take its type (**Send to…**), read the
session, show a toast, keep settings. A tool never reaches into another kit's code.

## A request to a kit

`/api/a/<kit>/<path>` is the only door.

1. The app works out who is asking: the visitor's address (`JIMKIT_PROXY_HOPS` decides which header is believed), the **tier**
   (`trusted`, `unlocked`, `public`) and the limits for that tier. The `Host` header has to be one the instance knows about, or the
   request is treated as public.
2. A disabled kit, or one with no server file, is refused. A request that changes something needs a same-origin `Origin`.
3. The route is matched (`METHOD pattern`) and its minimum tier checked.
4. The handler runs with the request and the kit's context. Anything it throws becomes a generic 500, never a stack trace.

`apps/web/server.mjs` records the connection's own address in a header after deleting any copy a client sent, and lifts Node's
request timeouts so large uploads are bounded by the size limits instead.

## A conversion

The converter is the heavy path. An upload is streamed to disk and its declared size checked against the tier's limit before a
byte is stored. A job plans a route through the formats it knows, and the app's queue starts it when a slot is free (a global
count, and one per visitor). Each step runs a program (ffmpeg, ImageMagick, Poppler, LibreOffice and others) as a child process
with a minimal environment and a deadline. The browser polls the job, the result is downloaded with the tier's bandwidth shaping,
and a sweep deletes everything after `JIMKIT_RETENTION_HOURS`. [security.md](security.md) covers what is done to hostile files.

## The interface

The shell (`apps/web/src/ui`) owns the home screen, the palette, the rail, settings and the Kits screen. A tool is drawn inside a
`ToolFrame` from `@jimkit/ui`, which gives every tool the same header, ⋮ menu, keyboard handling and focus behaviour. Menus, sheets
and dialogs share one Escape stack, so Escape closes only the top one.

A look is a token set plus CSS, switched without a reload. **Basic** is built in; Paper, Glass and Metro are kits and can be
switched off or removed. A look can also bring a **layout**: its own home screen, written against `useLayout()`. See
[themes.md](themes.md) and [layouts.md](layouts.md).

## Data

Everything the server keeps lives in one data folder (`JIMKIT_DATA_DIR`, `/data` in the image): job scratch space, each kit's own
folder, installed kits, and the settings file. Favourites, recent tools, the order of the home screen and similar choices stay in
the visitor's browser.

## Security in one paragraph

Jimkit treats files from visitors as hostile and kits as trusted. Defaults are conservative: no proxy headers believed, no unlock
code, limits on. Request bodies are bounded, requests that change something need a same-origin `Origin`, and the tier is decided
from the connection, not from anything a client sends. Kits are not sandboxed: add ones from people you would let run code on your
machine. The full model, and what each setting does, is in [security.md](security.md).

## Tests

`npm test` runs the unit tests (vitest) for the app, the packages and every kit. `npm run typecheck` checks the app and the site.
`tests/` holds the checks for the Docker image and for `jimkit update` and `jimkit delete`.
