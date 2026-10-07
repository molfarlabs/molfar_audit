#!/usr/bin/env bash
# Build dist/molfar_audit.zip with a top-level molfar_audit/ folder (what users drop into resources/).
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -f dist/server.js ]] || npm run build
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/molfar_audit/dist" "$STAGE/molfar_audit/web"
cp fxmanifest.lua config.json README.md LICENSE "$STAGE/molfar_audit/"
cp dist/server.js "$STAGE/molfar_audit/dist/"
cp web/report.html "$STAGE/molfar_audit/web/"
rm -f dist/molfar_audit.zip
(cd "$STAGE" && zip -qrX - molfar_audit) > dist/molfar_audit.zip
echo "dist/molfar_audit.zip"
