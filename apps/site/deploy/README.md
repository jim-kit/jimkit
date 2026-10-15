# Hosting the website

The site is a static export: plain files, no server code. The project's own copy runs on Cloudflare (next section). Any static host
works: build it and upload `apps/site/out/`. If you would rather run it yourself, `Dockerfile` builds it and serves it with nginx, and
`compose.example.yml` puts that container behind a Traefik v3 proxy that already handles TLS (Coolify's, or your own); sections 1 to 4
below are about that.

## Cloudflare

Cloudflare publishes static sites as a Worker with static assets. The repository root has a `wrangler.jsonc` that says which folder to
publish (`apps/site/out`) and a `.node-version` that asks for Node 22, so the dashboard has very little to fill in.

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a repository** (connect GitHub, and allow only this repository).
2. Pick the repository. Fill in:
   - **Project name:** `jimkit-site` (it has to match `name` in `wrangler.jsonc`)
   - **Build command:** `npm ci && npm run build:site`
   - **Deploy command:** `npx wrangler deploy`
   - **Preview command** (for other branches): `npx wrangler versions upload`
   - Leave the root directory and anything else as it is.
3. Save and deploy. Every push to `main` deploys again.
4. Open the project → **Settings** → **Domains & Routes** → **Add** → **Custom domain** → `jimkit.thejimmy.dev`. When the zone is on
   Cloudflare it creates the DNS record itself.
5. `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_REPO_URL` default to the project's own address and repository. If you host a fork under another
   name, add them under **Settings → Build → Variables and secrets** and deploy again.

`apps/site/public/_headers` gives the pages the same security and cache headers as the nginx setup below. The older Cloudflare Pages
product works as well (build output directory `apps/site/out`, environment variable `NODE_VERSION=22`).

## 1. Pick the address

The address is baked into the pages (canonical links, `sitemap.xml`, `robots.txt`, the social cards and the structured data), so choose
it before building and keep it. One name is the **canonical** one; a second can redirect to it.

| | |
|---|---|
| `jimkit.example.org` | The product's name in the address. This is the one to put in links and search results. |
| `kit.example.org` | Shorter to type, but generic: "kit" is also the word Jimkit uses for its add-ons. Fine as a redirecting alias, not as the canonical name. |

## 2. Build

From the repository root:

```sh
docker build -f apps/site/deploy/Dockerfile -t jimkit-site \
  --build-arg SITE_URL=https://jimkit.example.org \
  --build-arg REPO_URL=https://github.com/you/jimkit .
```

- `SITE_URL` is the canonical address with `https://` and no path. It defaults to the project's own site; set it when you host
  the site under another name, or every canonical link and the sitemap will point at the wrong place.
- `REPO_URL` is the repository the site links to, including from the docs' references to source files. It defaults to the project's repository;
  set it for a fork. An empty value removes the links (the references become plain text).
- `GOOGLE_VERIFICATION` and `BING_VERIFICATION` (optional) add the verification meta tags the search consoles ask for.

Without Docker: `NEXT_PUBLIC_SITE_URL=https://jimkit.example.org npm run build:site` writes `apps/site/out/`.

## 3. DNS and TLS

Point an `A` (and `AAAA`, if the proxy has one) record for the canonical name, and for the alias if you want one, at the machine that runs
the proxy. If you run a DNS server of your own that answers for that zone (AdGuard Home, Pi-hole, a router), add the same name there too
or it will not resolve from inside your network. The proxy gets the certificate by itself on the first request.

## 4. Run it behind Traefik

```sh
cd apps/site/deploy
cp compose.example.yml compose.yml
cat > .env <<'EOF'
SITE_HOSTNAME=jimkit.example.org
# ALIAS_HOSTNAME=kit.example.org     # optional: redirects (301) to the name above, keeping the path
# REPO_URL=https://github.com/you/jimkit
# PROXY_NETWORK=coolify              # the Docker network your Traefik reads
# CERT_RESOLVER=letsencrypt          # the certificate resolver it has
EOF
docker compose up -d --build
```

The labels assume Traefik's entry points are called `http` and `https` (Coolify's are). If yours differ, change the `entrypoints` lines.
Leave `ALIAS_HOSTNAME` out and the alias router matches nothing.

Check it from outside your network:

```sh
curl -sI https://jimkit.example.org/ | head -5            # 200, with the security headers
curl -s  https://jimkit.example.org/robots.txt            # names the sitemap
curl -s  https://jimkit.example.org/sitemap.xml | head    # every page, with the canonical address
curl -sI http://jimkit.example.org/ | grep -i location    # redirects to https
```

## The kit directory

`/kits` lists the kits that come built in (read from the addon manifests when the site is built) and the community kits, which the browser reads
from the registry's `index.json` when the page opens. A kit's own page is `/kits/view/?repo=user/name`, read the same way. So a new kit or
review shows up as soon as the registry rebuilds its index, with **no new deploy of the site**. If the registry can't be reached, the built-in kits
still show.

- `NEXT_PUBLIC_REGISTRY_INDEX_URL` (a build variable) reads another registry's index, for a fork.
- Submitting kits, writing reviews and the admin page use the registry's Supabase database from the browser. A fork with its own registry sets
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_KEY` (the publishable key, which is public by design) at build time.

## 5. Search engines

Everything a crawler needs is generated: `robots.txt`, `sitemap.xml`, a web manifest, `llms.txt` (a plain-text summary for language
models), canonical links on every page, Open Graph and Twitter cards, and JSON-LD (`SoftwareApplication`, `WebSite` and `FAQPage` on the home
page; `TechArticle` and breadcrumbs on the docs).

After the first deploy:

1. Add the site in Google Search Console and Bing Webmaster Tools. Verify it with a DNS record, or build with `GOOGLE_VERIFICATION` /
   `BING_VERIFICATION` set to the token they give you.
2. Submit `https://jimkit.example.org/sitemap.xml`.
3. Paste the home page into a rich-results test and a social-card preview to see what they make of it.

## Updating

Pull, then `docker compose up -d --build` again. The pages revalidate on every request, and the files under `/_next/static/` have hashed
names, so a new deploy shows at once and nothing stale is served.
