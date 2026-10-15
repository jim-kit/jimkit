# Kits

A kit adds tools to Jimkit, or a look (a theme kit: see [themes.md](themes.md)), or both. (In the code and in `docs/addons.md` the same thing is called an addon; the folder is `addons/`.) The
first-party ones are built into the image. Everyone else's you add from GitHub while Jimkit runs: no rebuild, no restart.

## Adding and removing

Open **Kits** (the rail, the bar on a phone, or next to Edit on the home screen). It is only there from your own network.

- **Browse** lists the registry: name, author, rating, what tools or themes it adds. Open one to see its versions and reviews.
- **Paste** `user/name` or a GitHub link into the box to add a kit the registry doesn't list.
- **Installed** lists what you added (switch off, update, remove) and the built-in kits (switch off, not remove). A kit that is switched off stays installed but adds nothing, tools or themes.

Adding a kit shows what you are about to install first: its tools, whether it runs code on the server, the programs it expects.
Nothing is installed until you press Install, and what is installed is exactly the file you were shown. The new tools appear on the
home screen immediately; an update takes effect the next time a tool is opened.

Removing a kit deletes its files. What it saved under `/data/addons/<id>` stays, so adding it again finds it.

## What you are trusting

A kit's browser code runs in Jimkit's page, and its server code runs inside the Jimkit process with Jimkit's permissions: it can
read the data folder and the settings, and use the network. There is no sandbox. Add kits from people you would let write code on
your machine. What Jimkit does to make that safer:

| | |
|---|---|
| **Where from** | Only GitHub release downloads (`github.com` and the storage hosts GitHub redirects them to). A redirect anywhere else is refused. The size is capped (6 MB). |
| **What is in it** | A kit is one JSON file with a manifest and four text files at most (`client.js`, `client.css`, `server.js`, `theme.css`). Nothing else is written to disk, whatever the file claims. The manifest is checked field by field. |
| **Is it the reviewed file** | The registry records the SHA-256 of every release. If the download differs, the install is refused: a release changed after it was listed. The dialog says which of three things applies: *listed* (this exact file is recorded), *new since the registry looked* (the kit is listed, this version isn't yet), *not in the registry* (you are trusting the author, and have to tick a box saying so). |
| **Who can add** | Only visitors on your own network, from Jimkit's own pages. `JIMKIT_KITS=off` switches adding and removing off entirely. |
| **Clashes** | A kit can't take the id or a tool id of another. It can't replace a built-in kit. |

A kit can't install system packages. If it expects a program (it lists them under `system.apt`) and it is missing, the tool says so
instead of failing later. If you run the `lite` image, kits that need ffmpeg and the like will tell you.

## Configuration

| Variable | Default | |
|---|---|---|
| `JIMKIT_KITS` | on | `off`: kits that are installed keep working, but nothing can be added, updated or removed from the screen |
| `JIMKIT_REGISTRY` | `jim-kit/registry` | Where the list comes from: another GitHub repository (`user/name`), an https URL to an `index.json`, or `off` |

Installed kits are in `/data/kits` (`installed.json` and one folder per version). Back that folder up with the rest of `/data`.

## Writing and publishing a kit

```sh
node cli/jimkit.mjs kits new word-count     # a working kit in addons/word-count, with a release workflow
npm run dev                                 # build it with the app, as any addon
node cli/jimkit.mjs kits pack addons/word-count
```

`pack` writes `dist/jimkit-kit.json`: your browser code and server code bundled (React, the UI kit and the SDK are left out: the
page provides them), plus a stylesheet holding only the Tailwind classes your source uses, written against the theme tokens so
your kit follows every theme. To publish:

1. Put the folder in a GitHub repository. Its address, `you/word-count`, is how people find it.
2. Set `version` in `package.json` and tag it: `git tag v1.0.0 && git push --tags`. The workflow the scaffold made builds the file
   and attaches it to the release. By hand: `gh release create v1.0.0 dist/jimkit-kit.json`.
3. Anyone can add it now by pasting `you/word-count`. To be in Browse, open a pull request on the registry (below).

Rules that come from how installs work:

- **A version is final.** Once the registry has seen a version, its hash is fixed. Changing the release afterwards makes installs
  fail. Publish a new version.
- **The id and tool ids are global on one install.** Pick names that won't clash: the kit's repository name is a good id.
- **Text only, 6 MB at most** (4 MB per file). Images go in as data URLs or SVG inside the code.
- **Server code can import Node's built-ins** and anything bundled in; the SDK comes from the host. A server that needs a native
  module can't be a kit yet.

`@jimkit/pack` (the packer behind `node cli/jimkit.mjs kits pack`) lives in `packages/pack`. The release workflow the scaffold writes
runs it with `npx @jimkit/pack`, which works once that package is on npm. Until then, pack in a Jimkit checkout with
`node cli/jimkit.mjs kits pack` and attach the file to the release by hand (`gh release create v1.0.0 dist/jimkit-kit.json`).

## The registry

The registry (`jim-kit/registry` by default) is a small database of GitHub links and reviews. It hosts no code: a kit lives in its author's
repository and everything shown about it comes from its releases. Every hour a script reads the approved kits and the reviews, looks at each
kit's releases, and writes `index.json` into the registry's repository. That file is the only thing Jimkit fetches (every ten minutes at most; if
GitHub can't be reached it shows the last copy it had).

- **Listing a kit**: sign in with GitHub on [the submit page](https://jimkit.thejimmy.dev/kits/submit/) and enter your repository. You can
  submit repositories under your own GitHub name, and it needs a release with a valid `jimkit-kit.json`. A maintainer then reviews every new
  kit by hand; until then it is shown as waiting for approval. After that, new releases of the kit appear on their own.
- **Reviewing**: *Write a review* in the kit's page opens the kit's page on the website, where you sign in with GitHub and give one to five
  stars and a few words. You can't review your own kit; one review per person per kit; you can change or delete yours.
- **Versions**: every release's hash is recorded the first time it is seen and never changed.
