# Themes and accents

Jimkit's look is a set of CSS variables, and a theme is a stylesheet that changes them. Four themes, each in dark and light, and seven accent colours ship with it (the last, Ink, is near-black on a light page and near-white on a dark one); visitors can
also pick any colour. A colour too close to the page's own is moved away from it (darker on a light page, lighter on a dark one), and a grey, black or white behaves like Ink. They choose in Settings (remembered in a cookie), and you set the default for new visitors in
Settings > Site > "Make this the default look" or in `jimkit.config.json` (`theme`, `mode`, `accent`).

**Basic** is part of the core and is always there. Every other theme is a **theme kit**: an addon that brings only a stylesheet. Paper, Glass
and Metro ship in the image as theme kits, and you can switch each one off, switch it on again, or add more from GitHub, the same way as any
other kit (Kits, on the home screen). A visitor whose chosen theme is switched off or removed gets the install's default look, or Basic.

| Theme | |
|---|---|
| **Basic** (default) | Grey surfaces, thin borders, small corners, no blur or glow. |
| **Paper** | Warm cream and brown-black ink (dark: the same in the evening), thin warm lines, moderate corners and a serif for page titles. The look of this project's website. |
| **Glass** | Soft, still glows taken from the accent colour behind frosted, translucent panels that catch the light along their top edge, thin light borders, larger corners and short, springy motion. Without the glows there would be nothing for the frosting to show, and with more than this it stops being calm. |
| **Metro** | Solid colour tiles, square corners, no animation. The home screen becomes a Start-screen that scrolls sideways on any scroll (wheel, touchpad, arrow keys). |

## Choosing which themes an install has

- **Minimal**: `./install/install.sh --minimal` (or `--themes basic`) installs the lite image with only Basic switched on. Paper, Glass and Metro are still in the
  image, switched off, and Kits turns them on. In `.env` that is `JIMKIT_DISABLED_ADDONS=theme-paper,theme-glass,theme-metro`.
- **Trimmed image**: to leave their stylesheets out of the image altogether, build with `ADDONS="text,hash,image,convert,devtools"` (see `docker/Dockerfile`).
- **Later**: Kits lists every theme kit with an on/off switch; added ones can also be removed. Settings > Look lists the themes that are on.

## Making a theme kit

A theme kit is a folder with a `package.json` and one stylesheet. No JavaScript is needed.

```
dusk/
  package.json
  src/theme.css
```

```json
{
  "name": "jimkit-kit-dusk",
  "version": "1.0.0",
  "author": "Ada Lovelace",
  "jimkit": {
    "id": "dusk",
    "name": "Dusk",
    "description": "A dim, purple-grey look.",
    "tools": [],
    "themes": [{ "id": "dusk", "name": "Dusk", "blurb": "Dim purple-grey surfaces" }]
  }
}
```

`src/theme.css` changes the tokens for your theme, in dark and light, and may restyle anything else:

```css
:root[data-theme="dusk"] {
  --color-bg: #1b1a24; --color-surface: #23222e; --color-raised: #2a2938;
  --color-line: #3a3850; --color-fg: #e6e3f2; --color-dim: #aaa6c4;
  --radius-2xl: 18px; --dur: 200ms;
}
:root[data-theme="dusk"][data-mode="light"] {
  --color-bg: #efedf6; --color-surface: #ffffff; --color-fg: #1d1b2a;
}
:root[data-theme="dusk"] .jk-card:is(button, a):hover { translate: 0 -3px; }
```

The rules:

- **Every rule starts from your theme**: `:root[data-theme="dusk"] …`. `node cli/jimkit.mjs kits pack` refuses a stylesheet with a rule that would restyle every theme. (Keyframes are the exception: give them a name of your own.)
- **Plain CSS only.** No `@import`, and `url()` may only hold a `data:` URI, so a theme can't load anything from outside its file.
- **Tokens first**: set `--color-*`, `--radius-*`, `--dur`, `--shadow`, `--lift` and `--blur` and the whole interface follows. Reach for selectors (`.jk-panel`, `.jk-card`, `.jk-tile`, `.jk-btn`) only for what tokens cannot do. The colour and radius tokens are in [packages/ui/src/tokens.css](../packages/ui/src/tokens.css); `--dur`, `--blur`, `--shadow`, `--lift` and the accents are in [packages/ui/src/styles.css](../packages/ui/src/styles.css).
- **Motion** reads `--dur`: set it to `0ms` for a theme that doesn't move (Metro does). Icons move only when `--dur` is above zero.
- **Layout.** The default is `"grid"`, the rail and the cards, built into the app. A theme kit can bring its own: a React component that draws the home screen from a plain description of the tools, with the app's own search, settings, drag-and-drop and menus around it. Metro's Start screen is one. [layouts.md](layouts.md) explains how, with a complete example. `"flat": true` turns off the app's hover lifts and custom controls for a look that has none.
- **Ids.** Two to 25 characters, starting with a letter, then lowercase letters, digits and dashes; `basic` is taken, and a kit whose theme id is already used by another kit is refused.
- `"order"` (a number) sets where the theme sits in the list in Settings: lowest first. The built-in looks use 10, 20 and 30; without one, a theme goes after them.
- Between one and four themes per kit; list each one in `themes` and scope each one's rules to its own id.

Pack it with `node cli/jimkit.mjs kits pack` in a Jimkit checkout (or `npx @jimkit/pack` once it is on npm), attach `dist/jimkit-kit.json` to a GitHub release, and anyone can add it from Kits with `user/name`. The registry lists a theme kit like any other (a `themes` list in place of `tools`).

## How it works (for contributors)

`packages/ui/src/styles.css` declares the tokens on `:root` (`--color-bg`, `--color-surface`, `--color-fg`, `--color-line`,
`--color-accent`, `--radius-*`, `--dur`, ...) and each theme re-declares them under `:root[data-theme="..."]` (Paper, Glass and Metro do it in `addons/theme-*/src/theme.css`, which the build gathers into one stylesheet). Tailwind generates
`bg-surface`, `text-fg`, `border-line`, `rounded-xl` and friends from those variables, so **nothing in the app or in an addon
hard-codes a colour**. A tool written once follows every theme. Rules of thumb:

- Use `bg-tint` / `bg-tint-2` for subtle overlays, `bg-field` for input backgrounds, `bg-accent text-accent-fg` for primary buttons.
- Use `jk-panel` and `jk-card` for surfaces. Don't use `bg-white/10`: it disappears on the light theme.
- Animations read `--dur`, so a theme can turn them off (Metro sets it to 0, and so does `prefers-reduced-motion`). Every Tailwind `transition` follows it too. Use the `jk-pop`, `jk-fade`, `jk-rise` classes, and animate only transform and opacity.
- Glass adds `--lift` for the hover shadow of its cards. A panel inside a panel loses its blur on purpose: nested blurs are slow. With `prefers-reduced-transparency` Glass uses solid surfaces and no glows.
- A theme changes the layout of the home screen only through `"layout"` (see [layouts.md](layouts.md)). Everything else is tokens and rules.
- Core rules that a flat look should not get (hover lifts, tile transitions, the checkbox tick) are written `:root:not([data-flat]) …`; a theme with `"flat": true` switches them off without the core knowing its name.

Accents (`data-accent`) set `--accent` and `--accent-rgb`.
