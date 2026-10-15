# Security

Jimkit processes files from strangers if you let it. This page says what it protects, what it doesn't, and the one setting you
must get right.

## Who counts as "on your network"?

Every visitor is one of three tiers, and the tier decides their limits and which features they can use:

| Tier | Who | Default limits |
|---|---|---|
| `trusted` | the visitor's address is inside `JIMKIT_TRUSTED_CIDRS` (home, office, VPN) | 5 GB per file, 2 jobs, no daily cap |
| `unlocked` | a stranger who entered your unlock code (if you set one) | same, with each download shaped to 30 Mbit/s, for an hour |
| `public` | everyone else | 2 GB per file, 1 job, 10 GB a day |

Only `trusted` visitors can change settings.

### The address, and `JIMKIT_PROXY_HOPS`

- **Direct** (`JIMKIT_PROXY_HOPS=0`, the default): the connection's own address is used. `X-Forwarded-For` and similar headers are
  **ignored**, so a stranger can't claim to be `192.168.1.5`.
- **Behind one reverse proxy** (`=1`): the proxy's connection is always local, so Jimkit reads the address the proxy wrote at the
  right-hand end of `X-Forwarded-For`. Anything to its left was written by the visitor and is not believed. With two proxies
  (a CDN, then your own), use `2`.
- **Fewer entries than proxies**: a request that arrives with fewer `X-Forwarded-For` entries than `JIMKIT_PROXY_HOPS` didn't
  come through all of them, so someone reached the port directly. Jimkit then believes no header at all (`X-Real-IP` is never
  read) and uses the connection's own address. A stranger stays public; a visitor on your own network stays trusted.

**If you put a proxy in front and leave this at 0, every visitor appears to come from the proxy's private address and is treated
as trusted.** If you set it to 1 with no proxy, visitors can forge their address by sending the header. When in doubt:
visit your instance from outside your network and check the session chip in the corner says "Public".

### Keep the port closed to everyone but the proxy

The header rule has one gap it can't close by itself. Someone who reaches Jimkit's port directly can send a forged
`X-Forwarded-For` with as many entries as you have proxies, and Jimkit can't tell it from the real thing. So with a proxy in
front, the port must only be reachable from the proxy:

- Docker Compose: set `JIMKIT_BIND` in `.env`. `127.0.0.1` if the proxy runs on the same machine; the machine's own LAN address
  if it runs elsewhere. The default, `0.0.0.0`, publishes the port on every network. `install.sh --behind-proxy` sets
  `127.0.0.1` for you (`--bind` changes it).
- Anything else (bare metal, a container platform, a proxy on another host): bind to the right address or firewall the port.
- Check with `node cli/jimkit.mjs doctor`. It complains about hops above 0 with an open port, and about traffic that doesn't match
  the setting (forwarding headers with hops at 0; no forwarding headers with hops above 0).

With Docker, the address Jimkit sees for a direct connection depends on how Docker publishes the port. With normal rootful
Docker the visitor's real address is kept. Connections made from the Docker host itself (a proxy on the same machine) show the
bridge gateway's address; that is fine behind a proxy, but with `JIMKIT_PROXY_HOPS=0` it means a local proxy makes everyone look like
the gateway, which is a private address and counts as trusted. Rootless Docker and Docker Desktop can hide the real address of every
connection in the same way, so don't rely on the trusted tier there without a proxy that sets `X-Forwarded-For`.

IPv6 addresses are never trusted. Add IPv4 networks to `JIMKIT_TRUSTED_CIDRS` rather than relying on them.

### The name in the address bar, and `JIMKIT_ALLOWED_HOSTS`

A page on someone else's site can make a browser on your network send requests to your Jimkit: it points its own name at your private
address (DNS rebinding). Those requests come from a trusted address, so on the address alone they would be trusted. Jimkit therefore
also looks at the `Host` header and treats a request under a name it doesn't recognise as **public**, whatever its address.

- With `JIMKIT_ALLOWED_HOSTS` set (`jimkit.example.org,*.example.net`), only those names are recognised.
- Without it, an IP address or `localhost` is always fine. Reached directly, so are one-word names (`jimkit`, `nas`) and names ending
  in `.local`, `.lan`, `.home.arpa`, `.internal` or `.ts.net`. Behind a reverse proxy (`JIMKIT_PROXY_HOPS` above 0) every name is
  accepted, because the proxy decides what reaches Jimkit; the proxy has to pass the name on in `Host` (or `X-Forwarded-Host`).
- If you reach your instance from inside your network by a public name (split DNS, hairpin NAT) and the session chip says **Public**,
  put that name in `JIMKIT_ALLOWED_HOSTS`.

## The unlock code

Optional. A visitor who enters the right code gets a signed, expiring, `HttpOnly` cookie. The code is stored as a scrypt hash.
Five wrong tries from one address in 15 minutes locks that address out for an hour, and a slower global limit slows a distributed
guesser. Unlocking exists only if both `JIMKIT_SESSION_SECRET` (32+ characters) and `JIMKIT_UNLOCK_HASH` are set. Rotate the code by
generating a new hash; changing the secret signs everyone out.

## What is hardened

- **Hostile files** (the converter). Engines run as child processes with no shell, a minimal environment, their own working
  directory and process group, and a timeout that kills the group. ffmpeg's input format is forced from the extension (a fake
  "video" can't be a playlist reading server files), ImageMagick uses a policy that allows only the formats converted and no
  delegates, pandoc runs with `--sandbox`, LibreOffice gets a fresh profile per job with its network closed (a dead proxy, so a document can't
  fetch anything), and a spreadsheet that calls `WEBSERVICE` (which can read a local file by `file://` address) is refused before
  LibreOffice sees it. Error messages shown to users never contain
  paths. `addons/convert/scripts/e2e.mjs` runs real conversions and hostile inputs (file inclusion through Markdown images,
  LaTeX `\input`, ffconcat scripts, ImageMagick scripts, SVG `<image>`, HTML iframes) with a positive control.
- **Uploads**: the declared length is checked against your limits before a byte is stored, and the stream is cut off if it turns
  out longer. Uploads are deleted as soon as their job ends; results after `JIMKIT_RETENTION_HOURS` (6 by default); everything is capped (30 GB, oldest first).
- **The web layer**: same-origin check on every state-changing request, `HttpOnly` `SameSite=Lax` cookies (`Secure` over HTTPS), a
  Content-Security-Policy with per-request nonces (`script-src 'self' 'nonce-…' 'strict-dynamic'`, `object-src 'none'`,
  `frame-ancestors 'none'`), `nosniff`, no framing, a strict referrer policy.
- **Markdown preview** escapes everything and emits a fixed set of tags. Links are limited to http(s), mailto and in-page; images
  are shown as links so a preview never fetches third-party pictures.
- **The container**: non-root, read-only root filesystem, no Linux capabilities, `no-new-privileges`, one writable volume.

## What is not protected

- **Addons are trusted code.** An addon runs inside the server process and its client code runs in the page. Install only addons
  you trust, as you would any plugin. The strict CSP limits what a bad addon's *client* code can load or send, but it can still
  do what the app can. Its server code is not sandboxed at all: it can read the data folder and settings and use the network.
- **Adding kits from the Kits screen runs someone else's code on this machine.** It is limited to your own network and to Jimkit's
  own pages, downloads only come from GitHub releases, and every file is checked against the hash the registry recorded
  ([kits.md](kits.md)). Anyone on your network can use that screen. If that is not acceptable (a shared network, an instance other
  people can reach from a trusted address), set `JIMKIT_KITS=off`; kits that are already installed keep working.
- **The update notice makes one outbound request** (to GitHub, at most every 12 hours, or 30 minutes after a failed try) asking for the latest version number. It sends no identifier and nothing from your install beyond a `User-Agent` of `jimkit/<your version>`, and it only reads. `JIMKIT_UPDATES=off` removes it.
- **Uploaded files are stored unencrypted** on the data volume for a few hours. Anyone with access to the host can read them.
- **No accounts.** Uploads belong to a random cookie; there is no per-user history.
- **Resource exhaustion is limited, not impossible.** The limits bound how much one visitor can do; a determined crowd can still
  fill the queue. Don't expose a `full` instance to the open internet without a reverse proxy that rate-limits, or keep it behind
  the unlock code.

## Reporting a problem

See [SECURITY.md](../SECURITY.md).
