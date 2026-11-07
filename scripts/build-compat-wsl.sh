#!/usr/bin/env bash
# Run from WSL with Node >=22 on PATH. Build on Linux, not /mnt/c or /mnt/d.
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
node -e 'if (+process.versions.node.split(".")[0] < 22) process.exit(1)'
WORK="$(mktemp -d "${TMPDIR:-/tmp}/excalidraw-compat-XXXXXXXX")"
trap 'echo "Build workspace retained: $WORK"' EXIT
tar -C "$ROOT" --exclude='./.git' --exclude='./node_modules' --exclude='./dist' -cf - . | tar -C "$WORK" -xf -
cd "$WORK"
npm ci --no-audit --no-fund
npm run test:compat
npm run test:obsidian:runner
npm run test:markdown-embeds
npm run build
node --check dist/main.js
node -e 'const fs=require("fs"); const source=JSON.parse(fs.readFileSync("manifest.json")); const built=JSON.parse(fs.readFileSync("dist/manifest.json")); if(source.minAppVersion!=="1.6.5" || built.minAppVersion!==source.minAppVersion || built.version!==source.version) throw Error("Manifest mismatch");'
mkdir -p "$ROOT/dist"
cp dist/main.js dist/styles.css dist/manifest.json "$ROOT/dist/"
echo "PASS: compatibility build published to $ROOT/dist"