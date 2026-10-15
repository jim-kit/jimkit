# Configuration

Settings come from two places:

- **Environment variables** (`.env` next to `compose.yml`): secrets and facts about how Jimkit is deployed. Restart to apply.
- **`/data/jimkit.config.json`**: preferences. The Settings page (gear icon, from your own network) edits it and the change applies
  without a restart. You can also edit it by hand.

Environment wins for secrets; the file wins for preferences.

## Environment variables

| Variable | Default | |
|---|---|---|
| `JIMKIT_SESSION_SECRET` | none | 32+ random characters. Signs the unlock cookie. Without it (and a code hash) unlocking is switched off. `openssl rand -hex 32` |
| `JIMKIT_UNLOCK_HASH` | none | From `node cli/jimkit.mjs unlock-hash "your code"` (run it in a checkout of the repository; it needs Node 22 on the machine, not in the container). Keep the single quotes in `.env`: the value contains `$`. |
| `JIMKIT_UNLOCK_TTL_MINUTES` | `60` | How long an unlock lasts |
| `JIMKIT_PROXY_HOPS` | `0` | Reverse proxies in front of Jimkit. **Read [security.md](security.md).** |
| `JIMKIT_TRUSTED_CIDRS` | loopback, `10/8`, `172.16/12`, `192.168/16`, `100.64/10` | Addresses that count as your network (comma separated) |
| `JIMKIT_ALLOWED_HOSTS` | none | Names this instance answers to, comma separated; `*.example.org` matches every name under it. A request that arrives under any other name is treated as public, whatever its address. Leave it empty and Jimkit accepts addresses, `localhost`, one-word names and `.local`, `.lan`, `.home.arpa`, `.internal` and `.ts.net` names when reached directly, and any name behind a proxy. Set it if you reach Jimkit by a public name from inside your network. See [security.md](security.md). |
| `JIMKIT_SITE_NAME` | `Jimkit` | Shown in the rail and the tab |
| `JIMKIT_DISABLED_ADDONS` | none | Comma-separated addon ids to switch off |
| `JIMKIT_KITS` | on | `off`: kits can't be added, updated or removed from the Kits screen. See [kits.md](kits.md). |
| `JIMKIT_REGISTRY` | `jim-kit/registry` | Where the Kits screen reads its list: a GitHub `user/name`, an https URL to an `index.json`, or `off` |
| `JIMKIT_UPDATES` | `jim-kit/jimkit` | Where the update notice looks for the newest version: a GitHub `user/name`, an https URL to a JSON file with a `version`, or `off`. See [install.md](install.md#updating). |
| `JIMKIT_DATA_DIR` | `/data` | Where uploads, results and the config file live |
| `JIMKIT_RETENTION_HOURS` | `6` | How long uploads and results are kept |
| `JIMKIT_SCRATCH_CAP_GB` | `30` | Hard cap on stored files; the oldest go first |
| `JIMKIT_GLOBAL_JOBS` | `2` | Conversions running at once, across everyone |
| `JIMKIT_ENGINE_THREADS` | `3` | Threads handed to ffmpeg and friends |
| `JIMKIT_VARIANT` | `full` | `lite` or `full`; used when building the image |
| `JIMKIT_PORT` | `3000` | Host port in `compose.yml` |
| `JIMKIT_BIND` | `0.0.0.0` | Address the port is published on in `compose.yml` (IPv4). Use `127.0.0.1` with a proxy on the same machine. See [security.md](security.md). |
| `JIMKIT_IMAGE` | none | Use a prebuilt image instead of building one |
| `JIMKIT_DEV_ORIGINS` | none | Development only: hosts allowed to reach `npm run dev` |

## jimkit.config.json

```jsonc
{
  "siteName": "My Kit",
  "theme": "basic",                 // default look for new visitors: basic | paper | glass | metro (the ones that are installed and on)
  "mode": "dark",                   // dark | light
  "accent": "blue",                 // blue | teal | green | orange | pink | purple | ink, or any colour as "hex-0d6efd"
  "allowedHosts": ["jimkit.example.org"],   // the same as JIMKIT_ALLOWED_HOSTS; the file wins when both are set
  "disabledAddons": ["image"],
  "trustedCidrs": ["192.168.1.0/24", "100.64.0.0/10"],
  "limits": {                       // overrides per tier: trusted | unlocked | public
    "public": { "maxFileBytes": "512MB", "dailyBytes": null, "concurrentJobs": 1 },
    "trusted": { "maxFileBytes": "20GB", "jobTimeoutSec": "4h" }
  },
  "addonConfig": { "my-addon": { "key": "value" } }     // handed to the addon as ctx.config
}
```

Sizes take a number of bytes or a readable string: `"512MB"`, `"5GB"`, `"16k"`, `"1.5g"` (units are 1024-based, case does not matter, the B is
optional). `jobTimeoutSec` takes seconds or `"90s"`, `"30m"`, `"2h"`.

Limit keys: `maxFileBytes`, `maxBatchBytes`, `maxFiles`, `concurrentJobs`, `jobTimeoutSec`, `dailyBytes` (`null` = unlimited),
`bandwidthMbit` (the speed of each download; `null` = uncapped). Invalid values are ignored.

## Build-time: which addons exist

`jimkit.config.json` in the **repository root** (not the data folder) lists which addons are compiled in: `{ "addons": "*" }` is
all of them. The stock images contain every first-party addon; switch features off at runtime instead.
