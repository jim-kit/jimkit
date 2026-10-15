# The Jimkit website

A static site (Next.js, `output: "export"`) with the real tools running in it. It is for showing Jimkit, not part of the app, and the
Docker image does not include it.

```sh
npm run dev:site        # http://localhost:3100
npm run build:site      # writes apps/site/out/
npm run serve -w apps/site    # serves out/ on :3300 with nothing but Node
```

What it reads at build time, so it cannot say something the product does not:

- the tool list, categories and **file actions** from every addon's `package.json` manifest (`src/lib/catalog.ts`),
- the docs from `docs/*.md` and the changelog from `CHANGELOG.md`, rendered with the text addon's Markdown renderer (`src/lib/docs.ts`;
  `src/lib/docs-meta.ts` is the list of published pages and their order),
- the logo, as in the app.

Things worth knowing:

- **The workbench runs real code.** `DemoWindow` loads an addon's client module and mounts its tool inside `<Embedded>` (from
  `@jimkit/ui`, which turns off the full-screen behaviour of `ToolFrame`) with a host that has no server. Only addons whose tools are
  entirely client-side are listed in `IN_PAGE` in `catalog.ts`.
- **The looks row** embeds `/frame/?look=basic|glass|metro`, a page with a single tool in that look (the site itself is in Paper). The page follows the visitor's
  mode and accent by `postMessage`.
- **Paper** is this site's own look. It is the app's Paper kit with the site's own tokens (`:root[data-theme="paper"]` in `globals.css`). The `.block-*` classes are
  colour bands that re-declare the tokens, so everything inside them adapts.
- **The look constants live in `src/lib/look-config.ts`**, a plain module: values exported from a `"use client"` file are not available
  to the server layout.
- The SHA-256 on the page falls back to a small JavaScript implementation, because `crypto.subtle` only exists on https and localhost.

Tests: `apps/site/tests`. To host the site, see [deploy/README.md](deploy/README.md).
