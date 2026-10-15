# Layouts

A **layout** is the home screen of a theme: the component that draws the page you land on. Jimkit has one built in, `grid` (the rail on the
left and the cards), and a theme kit can bring others. Metro's Start screen is one: it lives in
[addons/theme-metro/src/Start.tsx](../addons/theme-metro/src/Start.tsx), outside the core, and uses nothing a kit of yours can't.

A layout draws **the page and nothing else**. Search (`/`, Ctrl K), Settings, Kits, the file chooser, drag and drop, the colour dialog and the
tools themselves (they open full screen over the layout) are drawn by the app, above whatever layout is on. You decide how the tools
are shown and which buttons open those things.

## How a layout reaches the app

A layout never sees the app's internals. It calls `useLayout()` and gets a plain description of the page and a few actions
(`packages/sdk/src/layout.ts` has every type). The app can change inside without breaking a layout, and a layout that misbehaves can't
reach past that description.

```tsx
import { useLayout } from "@jimkit/sdk/react";

export function Hello() {
  const L = useLayout();
  return (
    <main>
      <h1>{L.siteName}</h1>
      {L.categories.map((c) => (
        <section key={c.id}>
          <h2>{c.name}</h2>
          {c.tools.map((t) => <button key={t.id} onClick={() => L.open(t)}>{t.name}</button>)}
        </section>
      ))}
    </main>
  );
}
```

That is a complete layout. The rest of this page is what you can add.

## Making a theme kit with a layout

A theme kit is a folder with a `package.json`, a client module and, if you like, a stylesheet:

```
list/
  package.json
  src/client.ts      the layouts the kit brings
  src/ListLayout.tsx the layout
  src/theme.css      optional: tokens and rules for the theme (see themes.md)
```

```json
{
  "name": "jimkit-kit-list",
  "version": "1.0.0",
  "jimkit": {
    "id": "list-theme",
    "name": "List",
    "description": "Every tool in one plain list.",
    "tools": [],
    "themes": [{ "id": "list", "name": "List", "blurb": "Everything in one plain list", "layout": "list" }]
  }
}
```

```ts
// src/client.ts
import { defineClient } from "@jimkit/sdk";
import { ListLayout } from "./ListLayout";

export default defineClient({ tools: {}, layouts: { list: ListLayout } });
```

- `themes[].layout` is the id of the layout the theme uses. Leave it out, or write `"grid"`, for the built-in one. Any other id has to be a key of `layouts` in the **same addon's** client module.
- `"flat": true` on a theme turns off the app's own extras: cards that lift when pointed at, the custom checkboxes, easing. The page gets a `data-flat` attribute. A layout that is built of flat blocks (Metro) wants it.
- One kit can bring several themes, and several themes may share one layout.
- A kit that is only a layout needs no `theme.css`. Pack it as any kit: `node cli/jimkit.mjs kits pack` (see [kits.md](kits.md)).
- If the layout is missing from the module, or throws, the visitor gets the built-in layout and the error is in the browser console. A broken layout can't lock anyone out of their tools.
- A layout that comes from a kit is a browser import: on a first visit, the page shows a spinner until it arrives. One built into the image is part of the first paint.

## What `useLayout()` gives you

**The page**

| | |
|---|---|
| `siteName` | the name the owner gave the install |
| `mode`, `setMode(mode)` | `"dark"` or `"light"`, and a way to switch |
| `mobile` | a phone or a touch tablet |
| `session` | who is looking: `tier` is `trusted`, `unlocked` or `public` |
| `toolCount` | how many tools are installed, hidden or not: tells "everything is hidden" from "nothing is installed" |

**The tools, as the visitor arranged them**

| | |
|---|---|
| `categories` | in the visitor's order, each with its `tools` in their order. Hidden ones are left out, except while `arranging` |
| `groups` | categories that share a block when the visitor chose "Group small categories": `[["convert","edit","inspect"],["write"]]`. One id alone stands alone |
| `favourites`, `recents` | tools, for rows of their own |
| `prefs`, `setPrefs(patch)` | the visitor's `group` and `wide` choices (the ArrangeBar changes them) |

A **tool** (`LayoutTool`) has `id`, `name`, `blurb`, `icon` (draw it with `<Icon name={tool.icon} />` from `@jimkit/ui`), `iconAnimation`, `category`, `favourite` and:

- `state`: `"ready"` opens; `"soon"` is listed but not there yet; `"locked"` needs the unlock code; `"unavailable"` can't run on this machine. Draw the last three dimmed. `note` says why, or what its limit is.
- `color`: `hue` (0 to 360) is the tile colour. `hex` is an exact colour the visitor chose: use it as it is. `own` says the visitor chose a swatch, so a layout that shifts hues to suit itself should leave this one.
- `quick`: ways to start it (`New JSON document`): `L.open(tool, quick.init)`.

**Actions**

| | |
|---|---|
| `open(tool, init?)` | opens a tool; when it can't be opened (locked, unavailable) the app says so in a message. You don't check |
| `chooseFiles()` | the file picker, then "What should happen to this?" |
| `openSearch()`, `openSettings()` | the palette and the Settings panel |
| `canManageKits`, `openKits()` | Kits is for visitors on the owner's network; hide the button when `canManageKits` is false |
| `arranging`, `setArranging(on)` | edit mode: reordering and hiding. A layout that doesn't want it simply never offers the button |
| `canReset`, `reset()` | back to the default arrangement |

## Parts the app draws for you

`L.parts` has the pieces every layout shares, so they behave the same everywhere and follow the app as it changes:

| | |
|---|---|
| `SessionChip` | the badge that says trusted, unlocked or public, and opens Settings (`dotFirst` for a small dot) |
| `ToolMenuButton` | the ⋮ button of a tool: open, copy link, favourite, colour, hide, and the tool's quick actions |
| `ToolMarks` | the star and colour buttons, for edit mode |
| `Grip` | the controls of one item in edit mode: handle, earlier, later, show or hide. `parts="grip"` or `"rest"` draws half of it; `axis="y"` for a list that runs down; `compact` for a small tile |
| `ArrangeBar` | the bar that floats in edit mode: Group small categories, Reset, Done (`corner` puts it in the corner, `wide` adds "Two columns wide") |
| `KitsDot`, `SettingsDot` | a dot that says a kit, or Jimkit, has an update |

`L.useToolContextMenu(tool)` returns `{ bind, menu }`: spread `bind` on the element and render `menu` once, and a right-click or a long press opens the same menu as the ⋮ button. Don't bind it while arranging, when the element is something to move.

## Editing: reordering and hiding

To let the visitor arrange the page in your layout, call the sort hooks once for each tool and category you draw, with the ids of its **siblings in the order you draw them**:

```tsx
const sort = L.useToolSort(tool, siblingIds);          // inside the component that draws one tool
const sort = L.useCategorySort(category, categoryIds); // inside the one that draws a category
```

`sort` has `item` (spread it on the element that is the item), `handle` (on the part that is dragged by; often the same element), `arranging` and `hidden`. While `sort.arranging` is true, draw the item as something to move (no click to open) and add `<L.parts.Grip sort={sort} />`; for a tool also `<L.parts.ToolMarks tool={tool} />`. The app does the rest: dragging with a ghost and a line for the drop spot, the keyboard and the buttons, the order saved for the next visit, hiding. Show `<L.parts.ArrangeBar />` while `L.arranging` so the visitor can finish.

## The complete example

This is the fixture the tests pack and run ([packages/pack/tests/fixtures/list-theme](../packages/pack/tests/fixtures/list-theme)): a list, with search, files, kits, edit and settings, the ⋮ menu, the right-click menu, and arranging.

```tsx
import type { LayoutCategory, LayoutTool } from "@jimkit/sdk";
import { useLayout } from "@jimkit/sdk/react";
import { Icon } from "@jimkit/ui";

/** One tool: a row you press to open, with its ⋮ menu; while arranging, the row is something to move. */
function Row({ tool, siblings }: { tool: LayoutTool; siblings: string[] }) {
  const L = useLayout();
  const { Grip, ToolMarks, ToolMenuButton } = L.parts;
  const sort = L.useToolSort(tool, siblings);
  const menu = L.useToolContextMenu(tool);
  return (
    <li {...sort.item} {...sort.handle} {...(sort.arranging ? {} : menu.bind)} className="flex items-center gap-3 border-b border-line py-2">
      <Icon name={tool.icon} size={18} />
      {sort.arranging ? (
        <>
          <span className="flex-1">{tool.name}</span>
          <ToolMarks tool={tool} />
          <Grip sort={sort} />
        </>
      ) : (
        <>
          <button className="flex-1 text-left disabled:opacity-50" disabled={tool.state !== "ready"} onClick={() => L.open(tool)}>
            {tool.name} <span className="text-faint">{tool.state === "ready" ? tool.blurb : tool.note ?? tool.state}</span>
          </button>
          <ToolMenuButton tool={tool} />
        </>
      )}
      {menu.menu}
    </li>
  );
}

function Section({ category, siblings }: { category: LayoutCategory; siblings: string[] }) {
  const L = useLayout();
  const sort = L.useCategorySort(category, siblings);
  const ids = category.tools.map((t) => t.id);
  return (
    <section {...sort.item} className="mb-8">
      <h2 {...sort.handle} className="mb-2 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-dim">
        {sort.arranging && <L.parts.Grip sort={sort} axis="y" />}
        {category.name}
      </h2>
      <ul>{category.tools.map((t) => <Row key={t.id} tool={t} siblings={ids} />)}</ul>
    </section>
  );
}

export function ListLayout() {
  const L = useLayout();
  const ids = L.categories.map((c) => c.id);
  return (
    <main className="mx-auto max-w-[720px] px-5 py-10">
      <header className="mb-8 flex items-center gap-2">
        <h1 className="flex-1 text-[28px] font-semibold">{L.siteName}</h1>
        <button onClick={L.openSearch} className="rounded-lg border border-line px-3 py-1.5 text-[13px]">Search</button>
        <button onClick={L.chooseFiles} className="rounded-lg border border-line px-3 py-1.5 text-[13px]">Files</button>
        {L.canManageKits && <button onClick={L.openKits} className="rounded-lg border border-line px-3 py-1.5 text-[13px]">Kits</button>}
        <button onClick={() => L.setArranging(true)} className="rounded-lg border border-line px-3 py-1.5 text-[13px]">Edit</button>
        <button onClick={L.openSettings} className="rounded-lg border border-line px-3 py-1.5 text-[13px]">Settings</button>
      </header>
      {L.categories.map((c) => <Section key={c.id} category={c} siblings={ids} />)}
      {!L.categories.length && <p className="text-dim">{L.toolCount ? "Everything is hidden. Press Edit to show some." : "No tools are installed."}</p>}
      {L.arranging && <L.parts.ArrangeBar />}
    </main>
  );
}
```

## Styling a layout

- **Tokens first.** Use the theme's tokens through Tailwind (`bg-surface`, `text-dim`, `border-line`, `rounded-xl`) and your layout follows every theme and both modes. See [themes.md](themes.md).
- **Classes the app promises to keep:** `jk-panel` (a surface), `jk-card` (a card; lifts when pointed at unless the theme is flat), `jk-btn`, `jk-tile` with `jk-own`/`jk-hex` (a coloured square, which reads `--hue`, `--own` and `--own-fg`), `jk-block` (a tile laid out as a block, not centred), `kbd`. Set `--hue` (and for an exact colour `--own` and `--own-fg`) from the tool's `color`, and `<Tile>` or those classes do the rest. `readableOn(hex)` from `@jimkit/ui` picks black or white text for a colour.
- **Icons** move when whatever holds them is pointed at (see [icons.md](icons.md)); draw them with `<Tile>` or `<Icon>` and they do.
- **Packed kits** carry their own stylesheet with just the Tailwind utilities their source uses, written against the same tokens, so a class you use in your layout works without you shipping the host's CSS.
- **Phones.** `L.mobile` says it is one. Draw something that works under a thumb: the app's own bars are not there.

## Testing a layout

A layout is a component and `useLayout()` reads a context, so it can be drawn with any object of the right shape. The repo's test (`packages/pack/tests/layouts.test.ts`) packs the example, loads the bundle the way the page does and renders it with a made-up `LayoutApi` and `renderToStaticMarkup`: the same few lines test yours. `LayoutContext` is exported from `@jimkit/sdk/react` for that.

## What is stable

`LayoutApi` and its parts are the contract; the app's internals behind them are not. A new field is added without breaking a layout; one is only taken away with a new `apiVersion` of addons (see [addons.md](addons.md)). Draw from this page and `packages/sdk/src/layout.ts`, not from the app's source.
