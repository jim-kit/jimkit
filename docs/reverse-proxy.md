# Behind a reverse proxy

Set `JIMKIT_PROXY_HOPS=1` in `.env` (and restart) **before** you point a proxy at Jimkit, and close the port to everything but
the proxy with `JIMKIT_BIND`. Read the first section of [security.md](security.md) to see why. `install.sh --behind-proxy` does
both. Then make sure the proxy:

1. sends `X-Forwarded-For` (and `X-Forwarded-Proto`, so cookies get the `Secure` flag). A proxy that only sets `X-Real-IP` won't
   do: that header is ignored,
2. passes the name people used on to Jimkit (`Host`, as the examples below do, or `X-Forwarded-Host`). Jimkit treats a request
   under a name it doesn't know as public; behind a proxy every name is accepted unless you set `JIMKIT_ALLOWED_HOSTS`,
3. does not buffer or cap request bodies below your file limits (uploads can be gigabytes), and
4. has an idle timeout of at least a few minutes (conversions are polled, but downloads are long).

## Where the proxy runs

`JIMKIT_BIND` in `.env` is the address the port is published on:

| Proxy | `JIMKIT_BIND` | The proxy connects to |
|---|---|---|
| on the same machine | `127.0.0.1` | `127.0.0.1:3000` |
| on another machine | this machine's LAN address, e.g. `192.168.1.10` | `192.168.1.10:3000` |
| a container on the same Docker network | leave the port unpublished: remove the `ports:` entry from `compose.yml` | `jimkit:3000` |

Run `docker compose up -d` after changing it, then `node cli/jimkit.mjs doctor`. The examples below use `127.0.0.1:3000`.

## Caddy

```
jimkit.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Caddy sets `X-Forwarded-For`/`-Proto` itself and has no body limit by default.

## Nginx

```nginx
server {
    server_name jimkit.example.com;
    # TLS config...
    client_max_body_size 6g;          # at least your per-file limit
    proxy_request_buffering off;      # stream uploads to Jimkit instead of spooling them to disk first
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Traefik (Docker labels)

```yaml
labels:
  - traefik.enable=true
  - traefik.http.routers.jimkit.rule=Host(`jimkit.example.com`)
  - traefik.http.routers.jimkit.tls=true
  - traefik.http.services.jimkit.loadbalancer.server.port=3000
```

Traefik adds `X-Forwarded-For`. Raise `respondingTimeouts.idleTimeout` on the entry point if you keep large downloads open.

## Cloudflare Tunnel or proxy

Works with `JIMKIT_PROXY_HOPS=1` (or `2` if another proxy of yours sits between the tunnel and Jimkit). Cloudflare's free and
pro plans **limit request bodies to 100 MB**, so large uploads through it fail; use a direct connection or a tunnel for the
trusted network only.

## Check it worked

Run `node cli/jimkit.mjs doctor` on the Jimkit machine after visiting the site through the proxy once. It reports a proxy
setting that doesn't match what arrives.

From a device outside your network, open the site and look at the session chip in the corner (top of the page on a phone, bottom
of the rail on a desktop): it should say **Public**. From inside your network it should say **Trusted**. If an outsider sees
"Trusted", `JIMKIT_PROXY_HOPS` is wrong. If everyone sees "Trusted" (or the proxy's own address shows in the chip), the proxy
isn't sending `X-Forwarded-For`.
