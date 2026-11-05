#!/usr/bin/env bash
# Läuft auf dem Raspberry Pi: entpackt, installiert (pnpm), übernimmt den vorgebauten Stand und startet den Familienplaner in pm2.
# Idempotent: unveränderter Code wird nicht neu installiert oder neu gebaut.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/family-planner}"
APP_DIR="${APP_DIR/#\~/$HOME}"
SRC_TGZ="${1:-/tmp/family-src.tgz}"
BUILD_TGZ="${2:-/tmp/family-build.tgz}"   # vorgebautes .next vom Windows-Rechner
export APP_PORT="${APP_PORT:-3003}"
NODE_MIN=22
STATE_DIR="$APP_DIR/.deploy-state"

cleanup_on_exit() {
  rm -rf "$APP_DIR/.next.new" 2>/dev/null || true
  rm -f "$SRC_TGZ" "$BUILD_TGZ" 2>/dev/null || true
}
trap cleanup_on_exit EXIT

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
skip() { printf '\033[0;32m    ✓ %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31mFEHLER: %s\033[0m\n' "$*" >&2; exit 1; }
node_major() { "$1" -p 'process.versions.node.split(".")[0]'; }

# --- Umgebung wie in einer Login-Shell (nvm, pnpm, ~/.local/bin) -------------
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
HAS_NVM=0
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  set +u; . "$NVM_DIR/nvm.sh"; set -u
  HAS_NVM=1
fi
export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
mkdir -p "$HOME/.local/bin" "$PNPM_HOME/bin"
export PATH="$HOME/.local/bin:$PNPM_HOME/bin:$PNPM_HOME:$PATH"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export NEXT_TELEMETRY_DISABLED=1
export npm_config_update_notifier=false

# --- Speicherplatz ----------------------------------------------------------------
free_mb() { df -Pm "$1" | awk 'NR==2 {print $4}'; }
log "Speicherplatz"
mkdir -p "$APP_DIR"
FREE="$(free_mb "$APP_DIR")"
echo "    frei: ${FREE} MB"
if [ "$FREE" -lt 300 ]; then
  die "Zu wenig Speicherplatz (${FREE} MB frei, mindestens 300 MB nötig)"
fi

# --- Node.js >= 22 (bestehendes Node anderer Apps wird NICHT verändert) -------
log "Node.js"
FAMILY_NODE=""
if command -v node >/dev/null 2>&1 && [ "$(node_major node)" -ge "$NODE_MIN" ]; then
  FAMILY_NODE="$(command -v node)"
  skip "vorhanden: $(node -v) ($FAMILY_NODE)"
elif [ "$HAS_NVM" -eq 1 ]; then
  if nvm ls "$NODE_MIN" >/dev/null 2>&1; then
    skip "Node $NODE_MIN bereits in nvm installiert"
  else
    echo "    installiere Node $NODE_MIN in nvm (Default bleibt $(nvm current))"
    nvm install "$NODE_MIN" --no-progress >/dev/null
  fi
  FAMILY_NODE="$(nvm which "$NODE_MIN")"
elif command -v node >/dev/null 2>&1; then
  die "System-Node $(node -v) ist älter als $NODE_MIN und wird evtl. von deiner anderen App genutzt.
       Ich ändere es nicht automatisch. Optionen:
         a) nvm installieren und erneut deployen
         b) System-Node bewusst aktualisieren und erneut deployen"
else
  echo "    kein Node gefunden -> installiere Node $NODE_MIN (NodeSource)"
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl gnupg build-essential python3
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MIN}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
  FAMILY_NODE="$(command -v node)"
fi
export PATH="$(dirname "$FAMILY_NODE"):$PATH"
export APP_NODE="$FAMILY_NODE"
echo "    Familienplaner nutzt: $("$FAMILY_NODE" -v) ($FAMILY_NODE)"

# --- pnpm (Version aus package.json "packageManager") --------------------------
log "pnpm"
PNPM_WANT="$(tar -xzOf "$SRC_TGZ" ./package.json | "$FAMILY_NODE" -p 'JSON.parse(require("fs").readFileSync(0,"utf8")).packageManager.split("@")[1]')"
PNPM_WANT_MAJOR="${PNPM_WANT%%.*}"
pnpm_ok() { command -v pnpm >/dev/null 2>&1 && [ "$( (cd /tmp && pnpm -v 2>/dev/null) | cut -d. -f1)" -ge "$PNPM_WANT_MAJOR" ] 2>/dev/null; }
if pnpm_ok; then
  skip "vorhanden: $(cd /tmp && pnpm -v)"
else
  if command -v corepack >/dev/null 2>&1; then
    echo "    aktiviere pnpm@$PNPM_WANT über corepack (nach ~/.local/bin, ohne sudo)"
    corepack enable --install-directory "$HOME/.local/bin" pnpm
    corepack prepare "pnpm@$PNPM_WANT" --activate >/dev/null
  else
    echo "    installiere pnpm@$PNPM_WANT nach ~/.local (ohne sudo)"
    npm install -g --prefix "$HOME/.local" "pnpm@$PNPM_WANT"
  fi
  hash -r
  pnpm_ok || die "pnpm >= $PNPM_WANT_MAJOR konnte nicht bereitgestellt werden"
  skip "pnpm $(cd /tmp && pnpm -v)"
fi

# --- pm2 (vorhandenes pm2 der anderen Apps wird mitgenutzt) --------------------
log "pm2"
if command -v pm2 >/dev/null 2>&1; then
  skip "vorhanden: $(command -v pm2) ($(pm2 -v 2>/dev/null | tail -1))"
else
  echo "    installiere pm2 (pnpm global)"
  (cd /tmp && pnpm add -g pm2)
  hash -r
fi

# --- Code entpacken -------------------------------------------------------------
log "Code nach $APP_DIR"
mkdir -p "$APP_DIR" "$STATE_DIR"
# alte Quellen entfernen; node_modules/, .next/ und Deploy-Status bleiben erhalten
find "$APP_DIR" -mindepth 1 -maxdepth 1 \
  ! -name node_modules ! -name .next ! -name .deploy-state -exec rm -rf {} +
tar -xzf "$SRC_TGZ" -C "$APP_DIR"
cd "$APP_DIR"

# --- Hashes für Änderungserkennung --------------------------------------------
DEPS_HASH="$( { echo "$("$FAMILY_NODE" -v) prod"; cat package.json pnpm-lock.yaml pnpm-workspace.yaml 2>/dev/null || true; } | sha256sum | cut -d' ' -f1)"
old() { cat "$STATE_DIR/$1" 2>/dev/null || true; }

# --- Install --------------------------------------------------------------------
log "Abhängigkeiten"
if [ -d node_modules ] && [ "$(old deps-hash)" = "$DEPS_HASH" ]; then
  skip "unverändert – pnpm install übersprungen"
else
  pnpm install --prod --frozen-lockfile || pnpm install --prod
  echo "$DEPS_HASH" > "$STATE_DIR/deps-hash"
  pnpm store prune >/dev/null 2>&1 || true
fi

# --- Build (vorgebaut vom Windows-Rechner) --------------------------------------
log "Build"
NEW_ID="$(tar -xzOf "$BUILD_TGZ" ./BUILD_ID)"
if [ -f .next/BUILD_ID ] && [ "$(cat .next/BUILD_ID)" = "$NEW_ID" ]; then
  skip "vorgebauter Stand $NEW_ID bereits aktiv"
  BUILT=0
else
  echo "    übernehme vorgebautes .next ($NEW_ID)"
  rm -rf .next.new
  mkdir .next.new
  tar -xzf "$BUILD_TGZ" -C .next.new
  rm -rf .next && mv .next.new .next
  BUILT=1
fi

# --- pm2 ------------------------------------------------------------------------
log "pm2-App family (Port $APP_PORT)"
pm2 list || true

status="$(pm2 jlist 2>/dev/null | "$FAMILY_NODE" -e '
  let s="";try{const a=JSON.parse(require("fs").readFileSync(0,"utf8")).find(p=>p.name==="family");
  s=a?a.pm2_env.status:""}catch{}; process.stdout.write(s)')"
cfg_hash="$( { echo "$APP_PORT $FAMILY_NODE"; cat ecosystem.config.cjs; } | sha256sum | cut -d' ' -f1)"

if [ "$status" = "online" ] && [ "$BUILT" -eq 0 ] && [ "$(old cfg-hash)" = "$cfg_hash" ]; then
  skip "läuft bereits mit aktuellem Stand – kein Neustart nötig"
else
  [ -n "$status" ] && pm2 stop family >/dev/null 2>&1 || true
  sleep 1
  if ss -ltnH "( sport = :$APP_PORT )" 2>/dev/null | grep -q .; then
    sudo ss -ltnp "( sport = :$APP_PORT )" >&2 || true
    [ -n "$status" ] && pm2 start family >/dev/null 2>&1 || true
    die "Port $APP_PORT ist von einer anderen Anwendung belegt. Anderen Port wählen: .\\deploy-pi.ps1 -Port 3004"
  fi
  if [ -n "$status" ]; then
    pm2 delete family >/dev/null
  fi
  pm2 start ecosystem.config.cjs
  echo "$cfg_hash" > "$STATE_DIR/cfg-hash"
  pm2 save
fi

# --- Autostart ------------------------------------------------------------------
log "Autostart"
if systemctl is-enabled "pm2-$USER.service" >/dev/null 2>&1; then
  skip "systemd-Unit pm2-$USER vorhanden"
else
  sudo env PATH="$PATH" "$(command -v pm2)" startup systemd -u "$USER" --hp "$HOME"
  pm2 save
fi

rm -f "$SRC_TGZ" "$BUILD_TGZ"

# --- Healthcheck ----------------------------------------------------------------
log "Healthcheck"
for _ in $(seq 1 20); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$APP_PORT/" || true)"
  [ "$code" != "000" ] && break
  sleep 1
done
if [ "${code:-000}" = "000" ]; then
  pm2 logs family --lines 30 --nostream || true
  die "Familienplaner antwortet nicht auf Port $APP_PORT"
fi
skip "HTTP $code"
pm2 status family
log "Fertig: http://$(hostname -I | awk '{print $1}'):$APP_PORT"
