#!/usr/bin/env bash
set -e

# 1. Run invariant rules test suite before deploying
echo "Running engine tests..."
node test.js

# 2. Target public directory (defaults to ~/www/simplekifu)
TARGET_DIR="${1:-/home/tashi/www/simplekifu}"

echo "Syncing production files to $TARGET_DIR..."

mkdir -p "$TARGET_DIR"

rsync -av --delete \
  --exclude='.git*' \
  --exclude='test.js' \
  --exclude='deploy.sh' \
  --exclude='README.md' \
  --exclude='package.json' \
  ./ "$TARGET_DIR/"

echo "🚀 Deployed successfully to $TARGET_DIR!"
