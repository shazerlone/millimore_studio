#!/usr/bin/env bash
#
# Fetch OBS Studio for macOS and turn it into a hidden background engine that
# Millimore bundles. The user installs only Millimore — this OBS never shows a
# dock icon, menu-bar item, or app-switcher entry (LSUIElement), so the product
# looks and feels entirely like Millimore, not "a skin over OBS".
#
# Usage:  scripts/fetch-obs-mac.sh <arch>        arch = x64 | arm64
# Env:    OBS_VERSION (default below)
#
set -euo pipefail

ARCH="${1:-$(uname -m)}"
case "$ARCH" in
  arm64|aarch64) VARIANT="Apple" ;;
  x64|x86_64)    VARIANT="Intel" ;;
  *) echo "fetch-obs-mac: unknown arch '$ARCH' (use x64 or arm64)"; exit 1 ;;
esac

OBS_VERSION="${OBS_VERSION:-30.2.3}"
DEST="resources/obs"
STAMP="$DEST/.obs-version"

# Already staged? Skip the 170MB download — this runs on EVERY package build.
if [ -d "$DEST/OBS.app" ] && [ "$(cat "$STAMP" 2>/dev/null || true)" = "${OBS_VERSION}-${VARIANT}" ] && [ -z "${OBS_FORCE:-}" ]; then
  echo "fetch-obs-mac: OBS ${OBS_VERSION} (${VARIANT}) already staged — skipping download (OBS_FORCE=1 to re-fetch)"
  exit 0
fi

DMG="OBS-Studio-${OBS_VERSION}-macOS-${VARIANT}.dmg"
URL="https://github.com/obsproject/obs-studio/releases/download/${OBS_VERSION}/${DMG}"
TMP_DMG="$(mktemp -t obs).dmg"
MNT="$(mktemp -d)"

echo "fetch-obs-mac: downloading OBS ${OBS_VERSION} (${VARIANT}) …"
curl -fL --retry 3 -o "$TMP_DMG" "$URL"

echo "fetch-obs-mac: mounting and copying OBS.app …"
hdiutil attach "$TMP_DMG" -nobrowse -quiet -mountpoint "$MNT"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$MNT/OBS.app" "$DEST/OBS.app"
hdiutil detach "$MNT" -quiet
rm -f "$TMP_DMG"

PLIST="$DEST/OBS.app/Contents/Info.plist"

# Hide from the Dock, app switcher and menu bar — run OBS as a background agent.
echo "fetch-obs-mac: hiding OBS (LSUIElement) …"
/usr/libexec/PlistBuddy -c "Set :LSUIElement true" "$PLIST" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "$PLIST"

# Editing the plist invalidates OBS's signature. Ad-hoc re-sign so the app
# launches on THIS machine for local (unsigned) testing. In CI with real Apple
# certs, electron-builder re-signs the nested app under the Developer ID, which
# supersedes this ad-hoc signature.
echo "fetch-obs-mac: ad-hoc re-signing (local launchability) …"
codesign --force --deep --sign - "$DEST/OBS.app" 2>/dev/null \
  || echo "fetch-obs-mac: ad-hoc sign skipped (codesign unavailable) — fine in CI"

echo "${OBS_VERSION}-${VARIANT}" > "$STAMP"
echo "fetch-obs-mac: done → $DEST/OBS.app"
