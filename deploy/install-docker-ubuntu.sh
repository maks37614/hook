#!/usr/bin/env bash
set -euo pipefail
if [[ "$EUID" -ne 0 ]]; then
  printf '%s\n' 'Run with sudo bash deploy/install-docker-ubuntu.sh' >&2
  exit 1
fi
source /etc/os-release
if [[ "$ID" != ubuntu ]]; then
  printf '%s\n' 'This installer supports Ubuntu only.' >&2
  exit 1
fi
case "$VERSION_CODENAME" in jammy|noble|resolute) ;; *)
  printf 'Unsupported Ubuntu release: %s\n' "$VERSION_CODENAME" >&2
  exit 1
esac
# Never remove an existing container runtime automatically.
for package in docker.io docker-compose docker-compose-v2 docker-doc podman-docker containerd runc; do
  if dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q '^install ok installed$'; then
    printf 'Existing package %s needs a migration review first. No packages removed.\n' "$package" >&2
    exit 1
  fi
done
apt-get update
apt-get install -y ca-certificates curl git gh
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $VERSION_CODENAME
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker run --rm hello-world
docker compose version
