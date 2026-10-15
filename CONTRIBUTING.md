# Contributing

Thanks for wanting to help. The short version: small, tested changes; addons rather than features in the core; a `Signed-off-by` line.

## Getting set up

```sh
npm ci
npm run dev           # http://localhost:3000   (?tier=public previews a visitor from outside your network)
npm test
npm run typecheck
```

Node 22+. The layout of the repository and the reasoning behind it are in [docs/architecture.md](docs/architecture.md).

## What goes where

- A new **feature** is usually a new **addon** (`node cli/jimkit.mjs addons new <id>`; see [docs/addons.md](docs/addons.md)). The core
  stays small on purpose.
- Changes to the **core** (`apps/web`) or the **SDK/UI** (`packages/*`) should say why an addon can't do it.
- Logic that doesn't need React or the DOM goes in `src/lib/` and gets a test. Look at `addons/text/tests` for the pattern.
- Don't hard-code colours, radii or durations: use the theme tokens (see [docs/themes.md](docs/themes.md)).
- No telemetry, no phone-home, no network calls the user didn't ask for.

## Before you open a pull request

- `npm test` and `npm run typecheck` pass.
- If you touched the converter or anything that handles uploaded files, run the end-to-end check against the `full` image
  (the commands are at the top of `addons/convert/scripts/e2e.mjs`).
- Security-relevant changes (tiers, proxy handling, uploads, engines, headers) need a test that would fail without them.
- Update the docs and `CHANGELOG.md`.

## Sign-off (DCO)

Add `Signed-off-by: Your Name <you@example.com>` to each commit (`git commit -s`). It certifies you wrote the change or have the
right to submit it under the project's license ([developercertificate.org](https://developercertificate.org)). There is no CLA. If
the project ever needs one (for example to offer a dual license), it will apply to contributions from that point on.

## Licenses

The core, first-party addons, CLI and installers are AGPL-3.0-or-later. `packages/sdk` and `packages/ui` are MIT. Your contribution
is under the license of the directory it lands in.

## Conduct

Be decent. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
