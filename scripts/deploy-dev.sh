#!/usr/bin/env bash
# Deploy molfar_audit to the dev server through the `fivem-dev` SSH alias.
# Usage: bash scripts/deploy-dev.sh [--fixtures]
set -euo pipefail
cd "$(dirname "$0")/.."
FIXTURES=${1:-}
SSH_OPTS=(-o ClearAllForwardings=yes)

npm run build
bash scripts/package.sh
scp -q "${SSH_OPTS[@]}" dist/molfar_audit.zip fivem-dev:/tmp/molfar_audit.zip
if [[ $FIXTURES == --fixtures ]]; then
  COPYFILE_DISABLE=1 tar -czf /tmp/mfx.tgz -C fixtures '[molfar_fixtures]'
  scp -q "${SSH_OPTS[@]}" /tmp/mfx.tgz fivem-dev:/tmp/mfx.tgz
fi

# shellcheck disable=SC2029  # $FIXTURES is meant to expand locally
ssh "${SSH_OPTS[@]}" fivem-dev "sudo bash -s -- $FIXTURES" <<'REMOTE'
set -euo pipefail
BASE=$(ls -d /opt/fivem/txData/*.base | head -1)
CFG=$BASE/server.cfg
DEST="$BASE/resources/[molfar]"
command -v unzip >/dev/null || apt-get -qq install -y unzip >/dev/null
mkdir -p "$DEST"
rm -rf "$DEST/molfar_audit"
unzip -q /tmp/molfar_audit.zip -d "$DEST"
grep -q '^ensure molfar_audit$' "$CFG" || printf '\nensure molfar_audit\n' >> "$CFG"
grep -q '^set molfar_audit:autorun' "$CFG" || printf 'set molfar_audit:autorun 90\n' >> "$CFG"
if [[ ${1:-} == --fixtures ]]; then
  rm -rf "$BASE/resources/[molfar_fixtures]"
  tar -xzf /tmp/mfx.tgz -C "$BASE/resources"
  mkdir -p "$BASE/resources/[molfar_fixtures]/mfx_man009/stream"
  truncate -s 17M "$BASE/resources/[molfar_fixtures]/mfx_man009/stream/big.ytd"
  grep -q '^ensure \[molfar_fixtures\]$' "$CFG" || printf 'ensure [molfar_fixtures]\n' >> "$CFG"
  ITEMS=$(find "$BASE/resources" -path '*ox_inventory/data/items.lua' | head -1)
  grep -q "mfx_noimage" "$ITEMS" || sed -i "0,/^return {/s//return {\n\t['mfx_noimage'] = { label = 'MFX no image' },/" "$ITEMS"
fi
chown -R fxserver:fxserver "$BASE/resources"
systemctl restart fivem
echo "deployed; autorun audit ~90 s after start"
REMOTE
