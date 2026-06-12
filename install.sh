#!/usr/bin/env bash
set -euo pipefail

# toj installer — curl -fsSL https://raw.githubusercontent.com/devskale/toj/skalify/install.sh | sh

REPO="devskale/toj"
BRANCH="skalify"

echo "toj installer"
echo "-------------"

# Check deps
for cmd in git npm node; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "✗ $cmd not found. Please install it first."
    exit 1
  fi
done
echo "✓ git, npm, node found"

# Clone to temp dir
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
echo "→ Cloning ${REPO}#${BRANCH}..."
git clone --depth 1 -b "$BRANCH" "https://github.com/${REPO}.git" "$tmpdir/toj" 2>&1

# Install prod deps only (no devDeps — dist/ is pre-built)
echo "→ Installing dependencies..."
cd "$tmpdir/toj"
npm install --omit=dev --no-save 2>&1

# Pack into tarball (skip prepack script — dist/ is committed)
echo "→ Packing tarball..."
npm pack --ignore-scripts 2>&1

# Install globally from tarball (avoids npm symlink bugs)
tgz=$(echo toj-*.tgz)
echo "→ Installing ${tgz}..."
npm install -g "$tgz" 2>&1

# Verify
echo ""
if command -v toj &>/dev/null; then
  echo "✓ $(toj --version 2>&1)"
else
  echo "✗ Install succeeded but 'toj' not found in PATH"
  echo "  npm bin -g: $(npm bin -g 2>/dev/null || echo 'unknown')"
  exit 1
fi
