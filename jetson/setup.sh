#!/usr/bin/env bash
# Install the whole Family Hub (dashboard + WhatsApp gateway) on the Jetson,
# with no cloud dependency. Run from a clone of this repo:
#
#   sudo ./jetson/setup.sh
#
# Safe to re-run: it keeps your .env, your data, and your WhatsApp login.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR=/opt/family-hub
DATA_ROOT="${DATA_ROOT:-/opt/family-hub-data}"
ENV_FILE="$INSTALL_DIR/.env"
OLD_SERVICE=family-hub-whatsapp.service
RUN_USER="${SUDO_USER:-$USER}"

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo ./jetson/setup.sh" >&2
  exit 1
fi

if ! command -v docker >/dev/null; then
  echo "==> Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "==> Installing the Docker Compose plugin"
  apt-get update && apt-get install -y docker-compose-plugin
fi
usermod -aG docker "$RUN_USER" || true
systemctl enable --now docker

# The gateway used to run as a systemd unit; the stack now owns it. Retire the
# unit but keep its WhatsApp login so you don't have to rescan the QR.
if systemctl list-unit-files | grep -q "^$OLD_SERVICE"; then
  echo "==> Retiring the standalone $OLD_SERVICE"
  systemctl disable --now "$OLD_SERVICE" || true
  if [[ -d /var/lib/family-hub/auth && ! -d "$DATA_ROOT/wa-auth" ]]; then
    echo "==> Migrating the existing WhatsApp login to $DATA_ROOT/wa-auth"
    mkdir -p "$DATA_ROOT"
    cp -a /var/lib/family-hub/auth "$DATA_ROOT/wa-auth"
  fi
  rm -f "/etc/systemd/system/$OLD_SERVICE"
  systemctl daemon-reload
fi

echo "==> Creating data directories under $DATA_ROOT"
mkdir -p "$DATA_ROOT/hub" "$DATA_ROOT/wa-auth"

echo "==> Copying repo to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
rsync -a --delete \
  --exclude node_modules --exclude .next --exclude data --exclude .git \
  --exclude .env \
  "$REPO_ROOT"/ "$INSTALL_DIR"/
chown -R "$RUN_USER":"$RUN_USER" "$INSTALL_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "==> Creating $ENV_FILE (edit it before the stack is useful)"
  cp "$REPO_ROOT/.env.example" "$ENV_FILE"
  printf '\nDATA_ROOT=%s\n' "$DATA_ROOT" >> "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  chown "$RUN_USER":"$RUN_USER" "$ENV_FILE"
  cat <<EOF

Fill in your keys before starting:
  sudo nano $ENV_FILE
At minimum set GEMINI_API_KEY (photo extraction) and API_TOKEN (any long
random string - the gateway uses it to reach the dashboard).

Then bring it up:
  cd $INSTALL_DIR && sudo docker compose up -d --build
EOF
  exit 0
fi

grep -q '^DATA_ROOT=' "$ENV_FILE" || printf '\nDATA_ROOT=%s\n' "$DATA_ROOT" >> "$ENV_FILE"

echo "==> Building and starting the stack (first build takes a few minutes)"
cd "$INSTALL_DIR"
docker compose up -d --build

cat <<EOF

==> Up. Dashboard:  http://$(hostname -I | awk '{print $1}'):3000
==> WhatsApp link:  http://$(hostname -I | awk '{print $1}'):8080
==> Logs:           cd $INSTALL_DIR && sudo docker compose logs -f
EOF
