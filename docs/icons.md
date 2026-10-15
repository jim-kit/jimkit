# Icons for tools and kits

Every tool and category has an `icon`. It shows in a coloured tile on the home screen, in search, in the tool's own header and in the
"What should happen to this?" list. Icons also **move**: point at a card, or focus it with the keyboard, and the icon plays a small
animation. Metro never moves, and neither does anything when the visitor's system asks for reduced motion. Icons only move: neither the icon nor its tile ever changes size.

## Choosing one

Use the name of an icon from the list below, exactly as written (they are [Lucide](https://lucide.dev) icons):

```json
{ "id": "word-count-tool", "category": "write", "name": "Word count", "blurb": "Counts words, characters and lines", "icon": "PenLine" }
```

A name Jimkit does not know shows a plain file icon, so check the spelling. These are the built-in icons, grouped by how they move:

**wiggle** (tilts and settles, like a tool being picked up): `Eraser`, `FilePen`, `Lock`, `LockOpen`, `PenLine`, `Puzzle`, `Wrench`

**spin** (turns half a circle): `Globe`, `Regex`, `Settings`, `Timer`

**tumble** (a full turn): `Dices`

**pop** (the parts appear one after another, rising into place): `Calculator`, `GitCompare`, `Palette`, `QrCode`, `Sparkles`, `Tags`, `WandSparkles`, `Wifi`

**spread** (the first and last stroke move apart and back (braces, links)): `Braces`, `Code`, `Link2`

**pinch** (corners move inwards and back (crop, scan)): `Crop`, `ScanSearch`, `ScanText`

**bounce** (a small hop): `Archive`, `Database`, `Download`, `Layers`, `Upload`

**draw** (every stroke is drawn in again, from nothing): `AudioLines`, `Binary`, `BookOpen`, `CalendarClock`, `CirclePlay`, `Clapperboard`, `Command`, `File`, `FileText`, `Film`, `Fingerprint`, `Folder`, `Hash`, `Headphones`, `Heading`, `Image`, `ListVideo`, `Music`, `Scissors`, `Search`, `Shield`, `Shuffle`, `Star`, `Terminal`

## Choosing how it moves

The built-in icons have the motion above. For any other icon (one you bring yourself, or a built-in you want to move differently), set
`iconAnimation` on the tool in `package.json`:

```json
{ "id": "word-count-tool", "icon": "PenLine", "iconAnimation": "draw" }
```

| `iconAnimation` | |
|---|---|
| `draw` | The default for any icon without a motion of its own. Every stroke is drawn in again. Needs a stroked icon (below). |
| `wiggle`, `spin`, `tumble`, `bounce` | The whole icon moves. Works on any icon. |
| `pop` | The parts of the icon (each path, circle or rectangle at the top level of the SVG) appear one after another, rising into place. Best on icons made of several separate pieces. |
| `spread`, `pinch` | The first and last part move apart (`spread`), or the odd and even parts move towards each other (`pinch`). Best on icons whose parts are symmetric. |
| `none` | Stays still. |

## Bringing your own icon

If none of the built-in icons fit, register your own in the client module and use its name:

```tsx
import { defineClient } from "@jimkit/sdk";

function Ruler({ size = 20, strokeWidth = 1.8, className }: { size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z" />
      <path d="m14.5 12.5 2-2" /><path d="m11.5 9.5 2-2" /><path d="m8.5 6.5 2-2" /><path d="m17.5 15.5 2-2" />
    </svg>
  );
}
export default defineClient({ tools: { /* … */ }, icons: { Ruler } });
```

For it to animate well:

- Draw it **24 by 24, in strokes**: `fill="none"`, `stroke="currentColor"`, round caps and joins. That is how Lucide draws, and it is what the `draw` motion traces. A solid, filled icon still works, but `draw` has nothing to trace, so give it `wiggle`, `spin` or `bounce`.
- Take `size`, `strokeWidth` and `className` as props and pass them to the `<svg>`. The host sizes the icon for the tile it is in.
- Keep the top-level parts of the SVG as separate elements, if you want `pop`, `spread` or `pinch` to have something to move.
- Use `currentColor`, never a fixed colour: the tile sets the colour for every theme.

Icons you register are available to your own tools and categories (`icon: "Ruler"`). They are not added to the shared set, so another kit cannot use them.

## In your own UI

The same tile is available to your tools: `Tile` from `@jimkit/ui` takes `icon`, `hue` and an optional `animation`, and moves when its card or button is pointed at.

```tsx
import { Tile } from "@jimkit/ui";
<button className="jk-card flex items-center gap-3 p-3"><Tile icon="PenLine" hue={285} /> Open the notes</button>
```
