# @jimkit/pack

Packs a Jimkit kit into one file, `dist/jimkit-kit.json`, the file a GitHub release carries and Jimkit installs from.

```sh
npx @jimkit/pack            # in the kit's folder (the one with package.json and src/)
npx @jimkit/pack ../my-kit --out /tmp/my-kit.json
```

It reads the `jimkit` field of `package.json` (plus `version`, `author` and `homepage` from the package), bundles `src/client.ts` and
`src/server.ts` with esbuild, builds a stylesheet of the Tailwind classes your source uses, checks the result with the same
validator Jimkit runs on install, and writes it.

React, `@jimkit/ui` and `@jimkit/sdk` are not bundled: the page provides them, so a kit renders with Jimkit's own React and theme.
The stylesheet is wrapped in `@layer kit`, below the host's utilities.

See [docs/kits.md](../../docs/kits.md). MIT licensed.
