#!/usr/bin/env bash
# Jimkit installer for Docker.
#
#   ./install/install.sh                      interactive: asks a few questions, then builds and starts Jimkit
#   ./install/install.sh --yes                no questions: the defaults, or whatever the flags say
#   ./install/install.sh --update             pull the latest code (or image) and restart, keeping your settings
#
# Flags (each one skips its question):
#   --variant lite|full     lite = text, hash, image editor, data conversion (~400 MB). full = + ffmpeg, LibreOffice and
#                           the other engines (~1.8 GB). Default: full.
#   --themes all|basic      all = every look that ships (Paper, Glass, Metro) is on, and can be switched off later in Kits. basic = only
#                           the Basic look, the others installed but off (switch them on in Kits any time). Default: all.
#   --minimal               --variant lite --themes basic: the smallest install
#   --port N                the port Jimkit listens on (default 3000)
#   --behind-proxy [N]      N reverse proxies sit in front (Nginx, Traefik, Caddy, a tunnel). Default 0. Getting this right
#                           decides who counts as "on your network": see docs/security.md. Also closes the port to everything
#                           but this machine (--bind 127.0.0.1) unless you say otherwise.
#   --bind ADDR             the address on this machine the port is published on. 0.0.0.0 = every network (default);
#                           127.0.0.1 = only this machine (default with --behind-proxy). If the proxy is on another machine,
#                           give this machine's own address on the network the proxy uses, e.g. 192.168.1.10.
#   --unlock-code CODE      a shared code that lets people outside your network use full limits (optional)
#   --trusted-cidrs LIST    addresses that count as your network (default: private ranges + Tailscale)
#   --dir PATH              where to install when run outside a checkout (default ~/jimkit)
#   --source URL|PATH       where to get Jimkit when run outside a checkout (a git URL, or a folder)
#   --image NAME            use a prebuilt image instead of building one
#   --no-start              write the configuration and build, but don't start it
#   --dry-run               say what would be written to .env and stop (nothing is built or started)
#   --yes, -y               assume the default for every question
set -euo pipefail

say()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m  %s\n' "$*" >&2; }
die()  { printf '\033[1;31mxx\033[0m  %s\n' "$*" >&2; exit 1; }

THEMES="" VARIANT="" PORT="" HOPS="" BIND="" DRY=0 CODE="" CIDRS="" DIR="" SOURCE="" IMAGE="" START=1 YES=0 UPDATE=0
ORIG_ARGS=("$@")
while [ $# -gt 0 ]; do
  case "$1" in
    --variant) VARIANT="${2:?}"; shift 2 ;;
    --themes) THEMES="${2:?}"; shift 2 ;;
    --minimal) THEMES=basic; [ -n "$VARIANT" ] || VARIANT=lite; shift ;;
    --port) PORT="${2:?}"; shift 2 ;;
    --behind-proxy) if [[ "${2:-}" =~ ^[0-9]+$ ]]; then HOPS="$2"; shift 2; else HOPS=1; shift; fi ;;
    --bind) BIND="${2:?}"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    --unlock-code) CODE="${2:?}"; shift 2 ;;
    --trusted-cidrs) CIDRS="${2:?}"; shift 2 ;;
    --dir) DIR="${2:?}"; shift 2 ;;
    --source) SOURCE="${2:?}"; shift 2 ;;
    --image) IMAGE="${2:?}"; shift 2 ;;
    --no-start) START=0; shift ;;
    --yes|-y) YES=1; shift ;;
    --update) UPDATE=1; shift ;;
    -h|--help) sed -n '2,/^set -/p' "$0" | grep '^#' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
done

# questions go to the terminal even when the script itself is piped from curl
ASK=0
if [ "$YES" -eq 0 ] && [ -r /dev/tty ] && [ -w /dev/tty ]; then ASK=1; fi
ask() { # ask "question" "default"  -> answer on stdout
  local q="$1" d="$2" a=""
  if [ "$ASK" -eq 1 ]; then read -r -p "$q [$d] " a < /dev/tty || true; fi
  printf '%s' "${a:-$d}"
}

# ── where is the project?
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
if [ -n "$HERE" ] && [ -f "$HERE/../compose.yml" ] && [ -f "$HERE/../docker/Dockerfile" ]; then
  ROOT="$(cd "$HERE/.." && pwd)"
else
  ROOT="${DIR:-$HOME/jimkit}"
  [ -n "$SOURCE" ] || die "Not run from a Jimkit checkout. Pass --source <git URL or folder>, or clone the repository and run install/install.sh from it."
fi

# ── Docker
need_docker() {
  # a dry run changes nothing, and installing Docker is a change
  if [ "$DRY" -eq 1 ]; then command -v docker >/dev/null 2>&1 || warn "Docker is not installed here: a real run would install it."; return 0; fi
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then return 0; fi
  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    warn "Docker with the Compose plugin is required."
    if [ "$(id -u)" -eq 0 ] || command -v sudo >/dev/null 2>&1; then
      SUDO=""; [ "$(id -u)" -eq 0 ] || SUDO="sudo"
      distro="$(. /etc/os-release 2>/dev/null; echo "${ID:-} ${ID_LIKE:-}")"
      case " $distro " in
        *" arch "*|*" cachyos "*|*" manjaro "*|*" endeavouros "*)
          case "$(ask 'Install Docker with pacman (docker, docker-compose, docker-buildx) and enable it? (y/n)' y)" in y|Y|yes|YES|Yes) ;; *) false ;; esac || die "Install Docker, then run this again: https://wiki.archlinux.org/title/Docker"
          $SUDO pacman -S --needed --noconfirm docker docker-compose docker-buildx
          $SUDO systemctl enable --now docker.service
          if [ "$(id -u)" -ne 0 ] && ! id -nG "$USER" | tr ' ' '\n' | grep -qx docker; then
            $SUDO usermod -aG docker "$USER"
          fi ;;
        *)
          case "$(ask 'Install Docker now with the official script (get.docker.com)? (y/n)' y)" in y|Y|yes|YES|Yes) ;; *) false ;; esac || die "Install Docker, then run this again: https://docs.docker.com/engine/install/"
          curl -fsSL https://get.docker.com | $SUDO sh || die "The Docker script doesn't support this system. Install Docker by hand: https://docs.docker.com/engine/install/" ;;
      esac
    else
      die "Install Docker first: https://docs.docker.com/engine/install/"
    fi
  fi
  # In the group (database) but this shell predates it: carry on inside the group instead of asking for a re-login.
  if ! docker info >/dev/null 2>&1 && [ "$(id -u)" -ne 0 ] && [ -z "${JIMKIT_IN_SG:-}" ] && [ -f "$0" ] \
     && id -nG "$USER" | tr ' ' '\n' | grep -qx docker; then
    say "Your shell doesn't have the 'docker' group yet; continuing inside it."
    if command -v sg >/dev/null 2>&1; then
      exec sg docker -c "JIMKIT_IN_SG=1 bash $(printf '%q ' "$0" "${ORIG_ARGS[@]}")"
    elif command -v sudo >/dev/null 2>&1; then
      exec sudo -u "$USER" -g docker env JIMKIT_IN_SG=1 bash "$0" "${ORIG_ARGS[@]}"
    fi
  fi
  docker info >/dev/null 2>&1 || die "Docker is installed but this user can't talk to it. Add yourself to the 'docker' group (then log in again) or run with sudo."
}
need_docker

# Containers inherit the host's DNS. A MagicDNS (Tailscale) or local-stub resolver isn't reachable from the Docker bridge,
# so the image build fails with "Temporary failure resolving 'deb.debian.org'". Say so before it costs five minutes.
if grep -Eq '^nameserver[[:space:]]+(100\.100\.100\.100|127\.)' /etc/resolv.conf 2>/dev/null && ! grep -q '"dns"' /etc/docker/daemon.json 2>/dev/null; then
  warn "This machine's DNS (/etc/resolv.conf) is a local/Tailscale resolver, which Docker containers usually can't reach."
  warn "If the build fails with 'Temporary failure resolving', set DNS for Docker and restart it:"
  warn "  sudo mkdir -p /etc/docker && echo '{\"dns\":[\"1.1.1.1\",\"8.8.8.8\"]}' | sudo tee /etc/docker/daemon.json && sudo systemctl restart docker"
fi

# ── get the code (outside a checkout)
if [ "$ROOT" != "$HERE/.." ] && [ ! -f "$ROOT/compose.yml" ] && [ "$DRY" -eq 1 ]; then
  say "A real run would fetch Jimkit from $SOURCE into $ROOT."
elif [ "$ROOT" != "$HERE/.." ] && [ ! -f "$ROOT/compose.yml" ]; then
  say "Fetching Jimkit into $ROOT"
  mkdir -p "$ROOT"
  if [ -d "$SOURCE" ]; then cp -a "$SOURCE"/. "$ROOT"/; else command -v git >/dev/null || die "git is needed to clone $SOURCE"; git clone --depth 1 "$SOURCE" "$ROOT"; fi
fi
cd "$ROOT" 2>/dev/null || { [ "$DRY" -eq 1 ] || die "Cannot enter $ROOT."; }
COMPOSE=(docker compose)

# ── update: keep the settings, refresh the code and the image
if [ "$UPDATE" -eq 1 ]; then
  [ -f .env ] || die "No .env here: nothing to update. Run the installer without --update first."
  # shellcheck disable=SC1091
  . ./.env 2>/dev/null || true
  if [ "${JIMKIT_PROXY_HOPS:-0}" != 0 ] && [ -z "${JIMKIT_BIND:-}" ]; then
    warn "This install is behind a proxy but the port is open on every network, so anyone who reaches it directly can pretend to be on your network."
    warn "Add JIMKIT_BIND=127.0.0.1 to .env (or this machine's LAN address if the proxy is elsewhere), then: docker compose up -d"
  fi
  # the same thing as `jimkit update --yes`: checks what changed, builds before swapping, saves your settings, rolls back if it fails
  exec "$ROOT/install/jimkit" update --yes
fi

# ── questions
if [ -f .env ]; then
  warn "An .env already exists here. Keeping it (your secrets stay the same). Delete it to start the questions over."
  flag_variant="$VARIANT"; flag_port="$PORT"; flag_bind="$BIND"; flag_hops="$HOPS"
  # shellcheck disable=SC1091
  . ./.env 2>/dev/null || true
  # the container is started from what .env says, so a flag that says something else would only build one thing and start another
  [ -z "$flag_variant" ] || [ "$flag_variant" = "${JIMKIT_VARIANT:-full}" ] || die "--variant $flag_variant, but .env says ${JIMKIT_VARIANT:-full}. Edit JIMKIT_VARIANT in .env, or delete .env to start the questions over."
  [ -z "$flag_port" ] || [ "$flag_port" = "${JIMKIT_PORT:-3000}" ] || die "--port $flag_port, but .env says ${JIMKIT_PORT:-3000}. Edit JIMKIT_PORT in .env, or delete .env to start the questions over."
  [ -z "$flag_bind" ] || [ "$flag_bind" = "${JIMKIT_BIND:-0.0.0.0}" ] || die "--bind $flag_bind, but .env says ${JIMKIT_BIND:-0.0.0.0}. Edit JIMKIT_BIND in .env, or delete .env to start the questions over."
  [ -z "$flag_hops" ] || [ "$flag_hops" = "${JIMKIT_PROXY_HOPS:-0}" ] || die "--behind-proxy says $flag_hops proxies, but .env says ${JIMKIT_PROXY_HOPS:-0}. Edit JIMKIT_PROXY_HOPS in .env, or delete .env to start the questions over."
  VARIANT="${JIMKIT_VARIANT:-full}"
  PORT="${JIMKIT_PORT:-3000}"
  BIND="${JIMKIT_BIND:-0.0.0.0}"
  HOPS="${JIMKIT_PROXY_HOPS:-0}"
else
  [ -n "$VARIANT" ] || { echo; echo "Which version?  lite: text, hash and image tools, data conversion (~400 MB)"; echo "                full: lite + conversion of images, video, audio, documents and PDFs (~1.8 GB)"; VARIANT="$(ask 'Variant (lite/full)?' full)"; }
  case "$VARIANT" in lite|full) ;; *) die "variant must be lite or full" ;; esac
  [ -n "$PORT" ] || PORT="$(ask 'Port?' 3000)"
  if [ -z "$HOPS" ]; then
    echo; echo "Will Jimkit sit behind a reverse proxy (Nginx, Traefik, Caddy, a Cloudflare Tunnel)?"
    echo "Say no if people reach it directly by IP and port. This decides who counts as 'on your network'."
    a="$(ask 'Behind a reverse proxy? (y/n)' n)"
    # "yes" and "Y" count: treating them as "no" would put every visitor on the proxy's private address, so they would all be trusted
    case "$a" in y|Y|yes|YES|Yes) HOPS=1 ;; *) HOPS=0 ;; esac
  fi
  if [ "${HOPS:-0}" != 0 ] && [ -z "$BIND" ]; then
    echo; echo "With a proxy in front, the port should only be reachable by the proxy. Otherwise anyone who can reach the port"
    echo "directly can pretend to be on your network."
    echo "  - Proxy on this same machine: answer 127.0.0.1 (the port is then closed to everything else)."
    echo "  - Proxy on another machine: answer this machine's address on the network the proxy uses (for example 192.168.1.10),"
    echo "    or 0.0.0.0 for every network and then firewall the port yourself."
    BIND="$(ask 'Address to listen on?' 127.0.0.1)"
  fi
  if [ -z "$CODE" ]; then
    echo; echo "An unlock code lets people OUTSIDE your network get full limits (leave empty to turn unlocking off)."
    CODE="$(ask 'Unlock code?' '')"
  fi
fi
case "${THEMES:-all}" in all|basic) ;; *) die "--themes must be all or basic" ;; esac
[[ "$PORT" =~ ^[0-9]+$ ]] || die "the port must be a number"
# a proxy in front means the port belongs to the proxy: closed to everyone else unless told otherwise
if [ -z "$BIND" ]; then if [ "${HOPS:-0}" != 0 ]; then BIND=127.0.0.1; else BIND=0.0.0.0; fi; fi
[[ "$BIND" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || die "--bind must be an IPv4 address such as 127.0.0.1 or 192.168.1.10"

if [ "$DRY" -eq 1 ]; then
  say "Dry run: nothing is written, built or started. The settings would be:"
  printf '    variant %s, port %s, listening on %s, proxy hops %s, unlock code %s, themes %s\n' "$VARIANT" "$PORT" "$BIND" "${HOPS:-0}" "$([ -n "$CODE" ] && echo set || echo none)" "${THEMES:-all}"
  exit 0
fi

# ── .env
if [ ! -f .env ]; then
  SECRET="$( (command -v openssl >/dev/null && openssl rand -hex 32) || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  umask 077
  {
    echo "# Written by install/install.sh. Never commit this file. Reference: docs/configuration.md"
    echo "JIMKIT_SESSION_SECRET=$SECRET"
    echo "JIMKIT_PROXY_HOPS=${HOPS:-0}"
    [ -n "$CIDRS" ] && echo "JIMKIT_TRUSTED_CIDRS=$CIDRS"
    echo "JIMKIT_VARIANT=$VARIANT"
    echo "JIMKIT_PORT=$PORT"
    echo "JIMKIT_BIND=$BIND"
    [ -n "$IMAGE" ] && echo "JIMKIT_IMAGE=$IMAGE"
    # the extra looks are theme kits that ship in the image: "basic" leaves them installed but off (Kits switches them on)
    if [ "${THEMES:-all}" = basic ]; then
      off="$(for d in addons/theme-*/; do [ -d "$d" ] && basename "$d"; done | paste -sd, -)"
      [ -z "$off" ] || echo "JIMKIT_DISABLED_ADDONS=$off"
    fi
  } > .env
  say "Wrote .env"
fi

# ── image
if [ -n "$IMAGE" ]; then
  say "Pulling $IMAGE"
  "${COMPOSE[@]}" pull jimkit
else
  say "Building the $VARIANT image (the first build takes a few minutes; the full variant downloads about 1.5 GB)"
  JIMKIT_VARIANT="$VARIANT" "${COMPOSE[@]}" build
fi

# ── unlock code -> hash (done with the image itself, so Node isn't needed on the host)
if [ -n "$CODE" ] && ! grep -q '^JIMKIT_UNLOCK_HASH=' .env; then
  img="${IMAGE:-jimkit:$VARIANT}"
  line="$(docker run --rm --entrypoint node "$img" /app/scripts/hash-code.mjs "$CODE")" || die "couldn't hash the unlock code"
  printf '%s\n' "$line" >> .env
  say "Unlock code set"
fi

[ "$START" -eq 1 ] || { say "Built. Start it with: docker compose up -d"; exit 0; }

# ── start and wait for it
"${COMPOSE[@]}" up -d --no-build 2>/dev/null || "${COMPOSE[@]}" up -d
say "Starting"
CHECK="$BIND"; [ "$CHECK" != 0.0.0.0 ] || CHECK=127.0.0.1
ok=0
for _ in $(seq 1 60); do
  if curl -fsS "http://$CHECK:$PORT/api/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
if [ "$ok" -ne 1 ]; then
  warn "Jimkit didn't answer within two minutes. Look at the log:  docker compose logs --tail 50"
  exit 1
fi
# `jimkit update`, `jimkit status` and `jimkit logs`, from anywhere: a link in a bin folder that is already on the PATH
LINKED=""
for d in /usr/local/bin "$HOME/.local/bin"; do
  if [ -d "$d" ] && [ -w "$d" ] && case ":$PATH:" in *":$d:"*) true ;; *) false ;; esac; then
    ln -sf "$ROOT/install/jimkit" "$d/jimkit" && LINKED="$d/jimkit" && break
  fi
done
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
say "Jimkit is running."
echo
if [ "$BIND" = 127.0.0.1 ]; then
  echo "    Listening: 127.0.0.1:$PORT (this machine only). Point your reverse proxy at it."
else
  echo "    Open:      http://${IP:-localhost}:$PORT"
fi
if [ -n "$LINKED" ]; then JK="jimkit"; else JK="$ROOT/install/jimkit"; fi
echo "    Update:    $JK update        (checks first, shows what changed, goes back if the new version fails)"
echo "    Also:      $JK status, $JK logs"
echo "    Settings:  open the page, then the gear icon (from your own network)"
if [ "${HOPS:-${JIMKIT_PROXY_HOPS:-0}}" = "0" ]; then
  echo
  echo "    Not behind a reverse proxy: anyone who can reach this port from a private address is 'trusted'."
  echo "    Putting a proxy in front later? Set JIMKIT_PROXY_HOPS=1 and JIMKIT_BIND=127.0.0.1 in .env first. See docs/security.md."
elif [ "$BIND" = 0.0.0.0 ]; then
  echo
  echo "    The port is open on every network. Firewall it so only the proxy can connect, or set JIMKIT_BIND in .env."
fi
