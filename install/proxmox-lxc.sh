#!/usr/bin/env bash
# Create a Proxmox LXC container running Jimkit (Docker inside an unprivileged container).
# Run this ON the Proxmox host, as root:
#
#   git clone https://github.com/jim-kit/jimkit.git && cd jimkit
#   bash install/proxmox-lxc.sh --source https://github.com/jim-kit/jimkit.git
#   bash install/proxmox-lxc.sh --source https://github.com/jim-kit/jimkit.git --variant lite --memory 3072
#
# It never touches an existing container: the CTID must be free. Everything has a flag:
#   --source URL|PATH   where to get Jimkit (a git URL, or a folder on this host)            [required]
#   --ctid N            container id (default: the next free one)
#   --hostname NAME     default jimkit
#   --themes all|basic  default all; basic leaves Paper, Glass and Metro installed but switched off (Kits switches them on)
#   --minimal           --variant lite --themes basic
#   --variant lite|full default full (full needs room for ~2 GB of image: use --disk 16 or more)
#   --cores N           default 2
#   --memory MB         default 4096 for full, 3072 for lite (building the image needs the room; you can lower it afterwards)
#   --swap MB           default 512
#   --disk GB           default 20 for full, 8 for lite
#   --storage NAME      storage for the container's disk (default: the first one that can hold containers)
#   --bridge NAME       default vmbr0
#   --ip dhcp|CIDR      default dhcp. For a fixed address: --ip 192.168.1.50/24 --gateway 192.168.1.1
#   --gateway ADDR
#   --port N            Jimkit's port inside (default 3000)
#   --behind-proxy [N]  a reverse proxy sits in front (see docs/security.md). The proxy is usually on another machine, so also
#                       say where the port may be reached: --bind (below), or a fixed --ip, whose address is used.
#   --bind ADDR         the container address Jimkit's port is published on. Default: every network, or with --behind-proxy
#                       and a fixed --ip, that address. Use 127.0.0.1 only if the proxy runs inside this same container.
#   --unlock-code CODE  shared code for people outside your network (optional)
#   --no-onboot         don't start the container when the host boots
#   --dry-run           print what would be done and change nothing
set -euo pipefail

say()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m  %s\n' "$*" >&2; }
die()  { printf '\033[1;31mxx\033[0m  %s\n' "$*" >&2; exit 1; }

THEMES="" CTID="" HOSTNAME_="jimkit" VARIANT="full" CORES=2 MEMORY="" SWAP=512 DISK="" STORAGE="" BRIDGE="vmbr0" IPCFG="dhcp" GATEWAY=""
SOURCE="" PORT=3000 HOPS="" BIND="" CODE="" ONBOOT=1 DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --source) SOURCE="${2:?}"; shift 2 ;;
    --ctid) CTID="${2:?}"; shift 2 ;;
    --hostname) HOSTNAME_="${2:?}"; shift 2 ;;
    --variant) VARIANT="${2:?}"; shift 2 ;;
    --themes) THEMES="${2:?}"; shift 2 ;;
    --minimal) THEMES=basic; VARIANT=lite; shift ;;
    --cores) CORES="${2:?}"; shift 2 ;;
    --memory) MEMORY="${2:?}"; shift 2 ;;
    --swap) SWAP="${2:?}"; shift 2 ;;
    --disk) DISK="${2:?}"; shift 2 ;;
    --storage) STORAGE="${2:?}"; shift 2 ;;
    --bridge) BRIDGE="${2:?}"; shift 2 ;;
    --ip) IPCFG="${2:?}"; shift 2 ;;
    --gateway) GATEWAY="${2:?}"; shift 2 ;;
    --port) PORT="${2:?}"; shift 2 ;;
    --behind-proxy) if [[ "${2:-}" =~ ^[0-9]+$ ]]; then HOPS="$2"; shift 2; else HOPS=1; shift; fi ;;
    --bind) BIND="${2:?}"; shift 2 ;;
    --unlock-code) CODE="${2:?}"; shift 2 ;;
    --no-onboot) ONBOOT=0; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) sed -n '2,/^set -/p' "$0" | grep '^#' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
done

run() { if [ "$DRY" -eq 1 ]; then printf '   + %s\n' "$*"; else "$@"; fi; }

[ "$(id -u)" -eq 0 ] || die "Run as root on the Proxmox host."
command -v pct >/dev/null && command -v pveam >/dev/null || die "pct/pveam not found: this must run on a Proxmox VE host."
[ -n "$SOURCE" ] || die "Pass --source <git URL or folder> (where Jimkit comes from)."
case "$VARIANT" in lite|full) ;; *) die "--variant must be lite or full" ;; esac
[ -n "$MEMORY" ] || { [ "$VARIANT" = full ] && MEMORY=4096 || MEMORY=3072; }
[ -n "$DISK" ] || { [ "$VARIANT" = full ] && DISK=20 || DISK=8; }
if [ ! -d "$SOURCE" ] && ! [[ "$SOURCE" =~ ^(https?|git|ssh):// || "$SOURCE" =~ ^git@ ]]; then die "--source isn't a folder or a git URL: $SOURCE"; fi

# a proxy in front means the port should only be reachable by the proxy; install.sh's own default (127.0.0.1) would lock out a
# proxy on another machine, which is the usual case for a container
if [ -n "$HOPS" ] && [ "$HOPS" != 0 ] && [ -z "$BIND" ]; then
  if [ "$IPCFG" != dhcp ]; then
    BIND="${IPCFG%%/*}"
    say "Behind a proxy: Jimkit's port will be published on $BIND only (the container's own address). Override with --bind."
  else
    die "With --behind-proxy, say where the port may be reached: --bind <the container's address> (needs a fixed --ip so you know it), --bind 127.0.0.1 if the proxy runs inside the container, or --bind 0.0.0.0 and firewall the port yourself."
  fi
fi

# ── id and storage
if [ -z "$CTID" ]; then CTID="$(pvesh get /cluster/nextid)"; fi
[[ "$CTID" =~ ^[0-9]+$ ]] || die "bad CTID: $CTID"
if pct status "$CTID" >/dev/null 2>&1 || [ -e "/etc/pve/lxc/$CTID.conf" ]; then die "Container $CTID already exists. Pick another with --ctid. (This script never touches existing containers.)"; fi
if [ -z "$STORAGE" ]; then
  STORAGE="$(pvesm status --content rootdir 2>/dev/null | awk 'NR>1 && $3=="active" {print $1; exit}')"
  [ -n "$STORAGE" ] || die "No storage that can hold containers was found. Pass --storage."
fi
TPL_STORAGE="$(pvesm status --content vztmpl 2>/dev/null | awk 'NR>1 && $3=="active" {print $1; exit}')"
[ -n "$TPL_STORAGE" ] || die "No storage for container templates was found."
say "Container $CTID ($HOSTNAME_): $CORES cores, ${MEMORY} MB, ${DISK} GB on $STORAGE, $VARIANT variant"

# ── template
say "Looking for the Debian 12 template"
run pveam update >/dev/null
TEMPLATE="$(pveam list "$TPL_STORAGE" 2>/dev/null | awk '/debian-12-standard/ {print $1}' | sort | tail -1)"
if [ -z "$TEMPLATE" ]; then
  NAME="$(pveam available --section system | awk '/debian-12-standard/ {print $2}' | sort | tail -1)"
  [ -n "$NAME" ] || die "No Debian 12 template is available from Proxmox."
  say "Downloading $NAME"
  run pveam download "$TPL_STORAGE" "$NAME"
  TEMPLATE="$TPL_STORAGE:vztmpl/$NAME"
fi

# ── create
NET="name=eth0,bridge=$BRIDGE"
if [ "$IPCFG" = dhcp ]; then NET="$NET,ip=dhcp"; else NET="$NET,ip=$IPCFG"; [ -z "$GATEWAY" ] || NET="$NET,gw=$GATEWAY"; fi
say "Creating the container"
run pct create "$CTID" "$TEMPLATE" --hostname "$HOSTNAME_" --cores "$CORES" --memory "$MEMORY" --swap "$SWAP" \
  --rootfs "$STORAGE:$DISK" --net0 "$NET" --unprivileged 1 --features nesting=1,keyctl=1 --onboot "$ONBOOT" --ostype debian \
  --description "Jimkit (installed by proxmox-lxc.sh). Update: pct exec $CTID -- /opt/jimkit/install/jimkit update"
run pct start "$CTID"

ARGS=(--yes --variant "$VARIANT" --port "$PORT")
[ -z "$THEMES" ] || ARGS+=(--themes "$THEMES")
[ -z "$HOPS" ] || ARGS+=(--behind-proxy "$HOPS")
[ -z "$BIND" ] || ARGS+=(--bind "$BIND")
[ -z "$CODE" ] || ARGS+=(--unlock-code "$CODE")

if [ "$DRY" -eq 1 ]; then
  say "Then inside the container: install/install.sh ${ARGS[*]/$CODE/***}"
  say "Dry run: nothing was changed."; exit 0
fi

inct() { pct exec "$CTID" -- "$@"; }
say "Waiting for the network"
for _ in $(seq 1 60); do inct getent hosts deb.debian.org >/dev/null 2>&1 && break; sleep 2; done
inct getent hosts deb.debian.org >/dev/null 2>&1 || die "The container can't resolve names. Check the bridge ($BRIDGE), DHCP and DNS, then: pct destroy $CTID"

say "Installing base packages and Docker (a few minutes)"
inct bash -c "export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y -qq curl ca-certificates git >/dev/null"
inct bash -c "curl -fsSL https://get.docker.com | sh >/dev/null 2>&1"
inct docker info >/dev/null 2>&1 || die "Docker didn't start inside the container. See: pct enter $CTID, then journalctl -u docker. (Nesting is enabled; some hosts need AppArmor adjustments.)"

say "Putting Jimkit in /opt/jimkit"
if [ -d "$SOURCE" ]; then
  TAR="$(mktemp /tmp/jimkit-src.XXXXXX.tar)"
  tar -C "$SOURCE" --exclude=node_modules --exclude=.next --exclude=.git --exclude=.env --exclude=apps/web/src/generated -cf "$TAR" .
  pct push "$CTID" "$TAR" /root/jimkit-src.tar
  rm -f "$TAR"
  inct bash -c "mkdir -p /opt/jimkit && tar -C /opt/jimkit -xf /root/jimkit-src.tar && rm /root/jimkit-src.tar"
else
  inct git clone --depth 1 "$SOURCE" /opt/jimkit
fi

say "Running the installer inside the container (building the $VARIANT image takes a while)"
inct bash /opt/jimkit/install/install.sh "${ARGS[@]}"

IP="$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}')"
echo
say "Done."
echo "    Open:     http://${IP:-<container address>}:$PORT"
echo "    Console:  pct enter $CTID"
if [ -d "$SOURCE" ]; then
  # a folder carries no history, so there is nothing for `jimkit update` to compare with
  echo "    Update:   this install came from a folder, so there is no history to compare: copy the new files over /opt/jimkit, then"
  echo "              pct exec $CTID -- docker compose -f /opt/jimkit/compose.yml up -d --build   (use a git URL as --source to get 'jimkit update')"
else
  echo "    Update:   pct exec $CTID -- /opt/jimkit/install/jimkit update"
fi
echo "    Remove:   pct stop $CTID && pct destroy $CTID"
