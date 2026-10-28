#!/usr/bin/env bash
# Prepares an ALREADY RUNNING Ubuntu droplet for the bot (same result as deploy/cloud-init.yaml).
# Safe to run more than once. Run it from your PC as root:
#   ssh root@DROPLET_IP 'bash -s' < deploy/setup-droplet.sh
set -euo pipefail

REPO="https://github.com/MrFo2sh/cyber-x-discord.git"
PUBKEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBbdSk9ZhLh2uLVkwwvKOxtO3VA5KpAXklGwHihQKFMK m.fouad2912@gmail.com"

echo "==> bot user"
if ! id bot >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" bot
fi
echo "bot ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/bot && chmod 440 /etc/sudoers.d/bot
mkdir -p /home/bot/.ssh
grep -qF "$PUBKEY" /home/bot/.ssh/authorized_keys 2>/dev/null || echo "$PUBKEY" >> /home/bot/.ssh/authorized_keys
chown -R bot:bot /home/bot/.ssh && chmod 700 /home/bot/.ssh && chmod 600 /home/bot/.ssh/authorized_keys

echo "==> packages + Node.js 24"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ufw unattended-upgrades ca-certificates curl git >/dev/null
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "    node $(node -v)"

echo "==> code from GitHub -> /opt/mvp-bot"
if [ -d /opt/mvp-bot/.git ]; then
  sudo -u bot git -C /opt/mvp-bot pull --ff-only
else
  rm -rf /opt/mvp-bot
  git clone -q "$REPO" /opt/mvp-bot
fi
mkdir -p /opt/mvp-bot/data
chown -R bot:bot /opt/mvp-bot
sudo -u bot bash -c 'cd /opt/mvp-bot && npm ci --omit=dev --no-audit --no-fund 2>&1 | tail -1'

echo "==> systemd service"
cat > /etc/systemd/system/mvp-bot.service <<'EOF'
[Unit]
Description=MVP Points Discord bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=bot
WorkingDirectory=/opt/mvp-bot
ExecStart=/usr/bin/node --env-file-if-exists=.env --no-warnings=ExperimentalWarning src/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/mvp-bot/data

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable mvp-bot >/dev/null 2>&1

echo "==> firewall (only SSH in) + SSH hardening"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null
ufw --force enable >/dev/null
cat > /etc/ssh/sshd_config.d/99-hardening.conf <<'EOF'
PasswordAuthentication no
PubkeyAuthentication yes
PermitRootLogin prohibit-password
KbdInteractiveAuthentication no
EOF
systemctl restart ssh

echo
echo "Droplet ready. Missing only .env (the token): from your PC run   .\\deploy.ps1 -WithData"
