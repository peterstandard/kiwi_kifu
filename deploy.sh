#!/usr/bin/env bash
set -e

# ==============================================================================
# Kiwi Kifu Deployment Pipeline
# Flow: 1. Test -> 2. Bump -> 3. Commit & Tag -> 4. Move to Production
#
# Usage:
#   ./deploy.sh                          # Tests, bumps patch, commits, pushes, deploys
#   ./deploy.sh patch "Commit message"   # Tests, bumps patch with message, pushes, deploys
#   ./deploy.sh minor "Feature release"  # Tests, bumps minor with message, pushes, deploys
#   ./deploy.sh major "Major redesign"   # Tests, bumps major with message, pushes, deploys
#   ./deploy.sh 1.3.0 "Battery saver"    # Tests, sets exact version, pushes, deploys
#   ./deploy.sh "Quick bugfix"           # Tests, bumps patch with message, pushes, deploys
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BUMP_ARG="patch"
COMMIT_MSG=""
TARGET_DIR="${TARGET_DIR:-/home/tashi/www/kiwikifu}"

# Parse command line arguments
if [[ $# -ge 1 ]]; then
  if [[ "$1" =~ ^(patch|minor|major|current|same|--no-bump|v?[0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
    BUMP_ARG="$1"
    if [[ $# -ge 2 ]]; then
      COMMIT_MSG="$2"
    fi
  else
    # First argument is a freeform commit message; default to patch bump
    COMMIT_MSG="$1"
  fi
fi

echo "=================================================="
echo "🥝 Kiwi Kifu Release & Deployment Pipeline"
echo "=================================================="

# ------------------------------------------------------------------------------
# Phase 1: Test Invariant Rules
# ------------------------------------------------------------------------------
echo ""
echo "▶ Phase 1: Running invariant rules & engine test suite..."
node test.js

# ------------------------------------------------------------------------------
# Phase 2: Synchronize & Bump Version
# ------------------------------------------------------------------------------
echo ""
echo "▶ Phase 2: Synchronizing version ($BUMP_ARG)..."
NEW_VERSION=$(node scripts/bump.js "$BUMP_ARG")
echo "  ✓ Version synchronized to v$NEW_VERSION across:"
echo "    - package.json"
echo "    - index.html (header tag & CSS query cache buster)"
echo "    - sw.js (service worker cache name kiwikifu-v$NEW_VERSION)"

# ------------------------------------------------------------------------------
# Phase 3: Git Commit, Tag, and Push
# ------------------------------------------------------------------------------
echo ""
echo "▶ Phase 3: Git commit, tag, and push..."
git add -A

if [ -z "$COMMIT_MSG" ]; then
  FULL_MSG="Release v$NEW_VERSION"
else
  FULL_MSG="Release v$NEW_VERSION: $COMMIT_MSG"
fi

if git diff --cached --quiet; then
  echo "  ℹ No changes to commit (working tree clean)."
else
  git commit -m "$FULL_MSG"
  echo "  ✓ Committed: $FULL_MSG"
fi

# Create annotated tag if not already existing for this commit
if ! git rev-parse "v$NEW_VERSION" >/dev/null 2>&1 || [ "$(git rev-parse "v$NEW_VERSION^{commit}")" != "$(git rev-parse HEAD)" ]; then
  git tag -fa "v$NEW_VERSION" -m "$FULL_MSG"
  echo "  ✓ Tagged release v$NEW_VERSION"
else
  echo "  ℹ Tag v$NEW_VERSION already points to current commit."
fi

# Push commit and tags to remote
if git remote get-url origin >/dev/null 2>&1; then
  echo "  Pushing to origin/main (with tags)..."
  git push origin main --tags
  echo "  ✓ Pushed successfully to origin/main"
fi

# ------------------------------------------------------------------------------
# Phase 4: Move to Production (rsync)
# ------------------------------------------------------------------------------
echo ""
echo "▶ Phase 4: Deploying production assets to $TARGET_DIR..."
mkdir -p "$TARGET_DIR"

rsync -av --delete \
  --exclude='.git*' \
  --exclude='test.js' \
  --exclude='deploy.sh' \
  --exclude='scripts*' \
  --exclude='*.md' \
  --exclude='package.json' \
  ./ "$TARGET_DIR/"

echo ""
echo "=================================================="
echo "🚀 Successfully deployed Kiwi Kifu v$NEW_VERSION to $TARGET_DIR!"
echo "=================================================="
