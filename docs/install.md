# Installing Jimkit

## What you need

- A Linux machine (or a Proxmox host) with 2 GB RAM free for the `lite` variant, 4 GB for `full`. Conversions use more while they run.
- Docker with the Compose plugin. The installer offers to install it.
- Disk: the image (400 MB or 1.8 GB) plus scratch space for uploads (default cap 30 GB, cleaned every few hours).
- An ARM machine works if the image is built on it (`install.sh` builds locally).

## Docker

```sh
git clone https://github.com/jim-kit/jimkit.git && cd jimkit
./install/install.sh
```

Flags skip the matching question (see `./install/install.sh --help`): `--variant lite|full`, `--port`, `--behind-proxy [N]`,
`--bind`, `--unlock-code`, `--trusted-cidrs`, `--themes all|basic`, `--yes`, `--dry-run` (shows the settings and stops). `--minimal` is the smallest install: the lite image with only the Basic look on (Paper, Glass and Metro are theme kits, installed but switched off; Kits switches them on, see [themes.md](themes.md)). With `--behind-proxy` the port is
published on `127.0.0.1` only, so nothing but a proxy on the same machine can reach it; if the proxy is on another machine, add
`--bind <this machine's LAN address>`. The script:

1. checks for Docker and Compose,
2. writes `.env` (mode 600) with a fresh random session secret and your answers,
3. builds the image and, if you gave an unlock code, hashes it with the image itself (Node isn't needed on the host),
4. starts the container and waits for `/api/health`,
5. prints the address.

Run it again at any time: an existing `.env` is kept, so your secrets don't change.

**Without the script**, by hand:

```sh
cp .env.example .env              # then fill in JIMKIT_SESSION_SECRET (openssl rand -hex 32)
docker compose up -d --build
```

The container runs as a normal user with a read-only filesystem, no capabilities and one writable volume (`/data`).

## Proxmox

Run on the Proxmox host as root:

```sh
git clone https://github.com/jim-kit/jimkit.git && cd jimkit                    # the host needs git: apt install git
bash install/proxmox-lxc.sh --source https://github.com/jim-kit/jimkit.git
bash install/proxmox-lxc.sh --source https://github.com/jim-kit/jimkit.git --variant lite --memory 3072 --ip 192.168.1.50/24 --gateway 192.168.1.1
```

It picks the next free container id, downloads the Debian 12 template if needed, creates an **unprivileged** container with
`nesting` and `keyctl` (what Docker needs), installs Docker inside, clones Jimkit into it and runs the installer. (`--source` also takes a folder on the host; that copy has no git history, so `jimkit update` can't work in it.) It never touches an
existing container, and `--dry-run` shows what it would do. Building the image needs room (3 GB RAM for `lite`, 4 GB for `full`);
you can lower the memory afterwards.

## Updating

The installer puts a `jimkit` command on your PATH (`/usr/local/bin/jimkit`, if it may write there; otherwise run `install/jimkit`). That is a different tool from `node cli/jimkit.mjs`, which is for kits, `doctor` and `unlock-hash` and is run from a checkout of the repository.

```sh
jimkit update --check     # changes nothing: exit 0 up to date, 10 an update exists, 2 could not tell
jimkit update             # shows what changed, asks, then updates
jimkit update --yes       # the same without the question (scripts, cron)
jimkit status             # version, container state, health, address
jimkit logs               # follow the logs; jimkit restart restarts the container
# on Proxmox: pct exec <id> -- /opt/jimkit/install/jimkit update
```

An update fetches the repository, lists the changes and builds the new image **while the old version keeps serving**. Only then
does it swap the container and wait until `/api/health` answers. If the new version never gets healthy, it goes back to the previous
commit and rebuilds that, and tells you so. Before anything changes it copies `.env` and your settings file to `backups/<date>/`.
`.env` and the data volume are never touched. `./install/install.sh --update` does the same thing.

Installs from a prebuilt image (`JIMKIT_IMAGE`) have no source to compare: `jimkit update` pulls the image again and restarts. On Proxmox, a container made from a folder (`--source /path`) carries no git history, so `jimkit update` has nothing to compare with: copy the new version into `/opt/jimkit` and run `docker compose up -d --build` there, or install from a git URL to get `jimkit update`.

**The notice inside the app.** Jimkit looks at most every 12 hours (and 30 minutes after a failed try) whether a newer version exists and, for visitors on your network,
shows a dot on Settings and a line in Settings, Updates, saying which version and how to update. The app never updates itself. The
check is one request to GitHub that carries nothing about you or your install. `JIMKIT_UPDATES=off` switches it off
([configuration.md](configuration.md)).

## Removing

```sh
jimkit delete                  # container, image and the jimkit command; keeps your data and this folder
jimkit delete --data           # also the data volume (uploads, results and jimkit.config.json)
jimkit delete --files          # also this folder, with .env
jimkit delete --all            # everything
jimkit delete --all --dry-run  # only show what would go
```

It shows the plan and asks first (`--yes` skips the question; without a terminal it refuses unless you pass it). Before it deletes the data or the folder it copies `.env` and your settings to `~/jimkit-removed-<date>` (owner only; `--no-backup` skips that). By hand: `docker compose down` keeps the data volume, `docker compose down -v` deletes it. On Proxmox, to remove the whole container: `pct stop <id> && pct destroy <id>` on the host.

## Custom images

Kits that aren't added from the Kits screen are built into the image: `node cli/jimkit.mjs addons add <npm package | folder>` then
`node cli/jimkit.mjs build --docker`. See [addons.md](addons.md).

## Troubleshooting

`node cli/jimkit.mjs doctor` (run in a checkout of the repository; it needs Node 22 on that machine) checks Node, the addon registry, system packages and the proxy setting. `docker compose logs --tail 100` shows the
server log; each addon prefixes its lines (`[convert] engines: ...`). If a tool shows "Needs setup", the card says what is missing:
usually you are running `lite` and want `full`.
