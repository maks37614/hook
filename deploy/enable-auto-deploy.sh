#!/usr/bin/env bash
set -euo pipefail
if [[ "$EUID" -ne 0 || -z "${SUDO_USER:-}" || "$SUDO_USER" == root ]]; then
  printf '%s\n' 'Run from the application checkout using sudo bash deploy/enable-auto-deploy.sh' >&2
  exit 1
fi
cd "$(dirname "${BASH_SOURCE[0]}")/.."
hook2_app_dir="$(pwd -P)"
hook2_user="$SUDO_USER"
hook2_user_home="$(getent passwd "$hook2_user" | cut -d: -f6)"
if [[ ! "$hook2_app_dir" =~ ^/[A-Za-z0-9_./-]+$ || ! "$hook2_user_home" =~ ^/[A-Za-z0-9_./-]+$ ]]; then
  printf '%s\n' 'The application and user paths must not contain whitespace or shell metacharacters.' >&2
  exit 1
fi
getent group docker >/dev/null
if ! sudo -H -u "$hook2_user" gh auth status >/dev/null 2>&1; then
  printf '%s\n' 'Complete gh auth login --hostname github.com --web as the VPS user first.' >&2
  exit 1
fi
sudo -H -u "$hook2_user" git -C "$hook2_app_dir" rev-parse --git-dir >/dev/null
if [[ -L .env ]]; then
  printf '%s\n' 'The initial checkout .env must be a regular private file.' >&2
  exit 1
fi
if [[ ! -e .env ]]; then
  read -r -s -p 'Telegram Bot Token: ' hook2_bot_token < /dev/tty
  printf '\n'
  if [[ ! "$hook2_bot_token" =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]]; then
    printf '%s\n' 'Invalid Telegram token format.' >&2
    exit 1
  fi
  umask 077
  printf 'NODE_ENV=production\nPORT=3000\nDATA_DIR=/data\nDOMAIN=h00k.top\nTELEGRAM_BOT_TOKEN=%s\n' "$hook2_bot_token" > .env
  unset hook2_bot_token
fi
test -f .env
chmod 0600 .env
chown "$hook2_user:$hook2_user" .env
hook2_agent_dir="$hook2_user_home/.local/lib/hook2-vps"
hook2_state_dir="$hook2_user_home/.local/state/hook2-vps"
sudo -H -u "$hook2_user" mkdir -p -m 0700 "$hook2_agent_dir" "$hook2_state_dir"
install -m 0600 -o "$hook2_user" -g "$hook2_user" deploy/vps_autodeploy.py "$hook2_agent_dir/agent.py"
cat > /etc/hook2-vps.env <<EOF
HOOK2_APP_DIR=$hook2_app_dir
HOOK2_STATE_DIR=$hook2_state_dir
HOOK2_AGENT_FILE=$hook2_agent_dir/agent.py
HOOK2_PUBLIC_URL=https://h00k.top
EOF
chmod 0644 /etc/hook2-vps.env
cat > /etc/systemd/system/hook2-vps.service <<EOF
[Unit]
Description=Deploy CI-approved hook2 main to the VPS
Wants=network-online.target
After=network-online.target docker.service
Requires=docker.service

[Service]
Type=oneshot
User=$hook2_user
Group=$hook2_user
SupplementaryGroups=docker
WorkingDirectory=$hook2_app_dir
EnvironmentFile=/etc/hook2-vps.env
ExecStart=/usr/bin/python3 $hook2_agent_dir/agent.py
TimeoutStartSec=25min
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
EOF
cat > /etc/systemd/system/hook2-vps.timer <<'EOF'
[Unit]
Description=Check validated hook2 updates every minute

[Timer]
OnBootSec=45s
OnUnitInactiveSec=60s
RandomizedDelaySec=10s
AccuracySec=5s
Unit=hook2-vps.service

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now hook2-vps.timer
systemctl start --no-block hook2-vps.service
printf '%s\n' 'Automatic deployment enabled. Follow progress with:'
printf '%s\n' 'sudo journalctl -u hook2-vps.service -n 80 --no-pager'
