#!/usr/bin/env bash
# Install the Family Hub WhatsApp gateway as an always-on service on the Jetson.
# Run from a clone of this repo:  sudo ./jetson/setup.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR=/opt/family-hub
ENV_FILE=/etc/family-hub/whatsapp.env
SERVICE=family-hub-whatsapp.service
RUN_USER="${SUDO_USER:-$USER}"

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo ./jetson/setup.sh" >&2
  exit 1
fi

node_major() { node -v 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/'; }

if [[ "$(node_major)" == "" || "$(node_major)" -lt 20 ]]; then
  echo "==> Installing Node.js 22 (arm64)"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "==> Node $(node -v)"

echo "==> Copying repo to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
rsync -a --delete \
  --exclude node_modules --exclude .next --exclude data --exclude .git \
  "$REPO_ROOT"/ "$INSTALL_DIR"/
chown -R "$RUN_USER":"$RUN_USER" "$INSTALL_DIR"

echo "==> Installing gateway dependencies"
sudo -u "$RUN_USER" npm install --omit=dev --prefix "$INSTALL_DIR/whatsapp"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "==> Creating $ENV_FILE (edit it before the service will work)"
  install -d -m 755 "$(dirname "$ENV_FILE")"
  install -m 600 "$REPO_ROOT/jetson/whatsapp.env.example" "$ENV_FILE"
  NEEDS_ENV=1
else
  echo "==> Keeping existing $ENV_FILE"
fi

echo "==> Installing $SERVICE"
sed "s/__USER__/$RUN_USER/" "$REPO_ROOT/jetson/$SERVICE" > "/etc/systemd/system/$SERVICE"
systemctl daemon-reload
systemctl enable "$SERVICE"

if [[ "${NEEDS_ENV:-0}" == "1" ]]; then
  cat <<EOF

Almost done. Fill in API_URL and API_TOKEN:
  sudo nano $ENV_FILE
Then start it:
  sudo systemctl start $SERVICE
  journalctl -u $SERVICE -f
EOF
else
  systemctl restart "$SERVICE"
  echo "==> Started. Logs: journalctl -u $SERVICE -f"
fi
