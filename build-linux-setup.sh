#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$PROJECT_DIR/dist"
STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pengudive-build.XXXXXX")"

# Version format: DDMMYYHHMM (day/month/2-digit-year/hour/minute, e.g. 1211261109)
VERSION_STAMP="${VERSION_STAMP:-$(date +%d%m%y%H%M)}"
GAME_FULL_NAME="PenguDive $VERSION_STAMP"

cleanup() {
  rm -rf "$STAGE_DIR"
}
trap cleanup EXIT

echo "==> Stamping version: $GAME_FULL_NAME ..."

# Update src/version.js & index.html with the build timestamp version
cat > "$PROJECT_DIR/src/version.js" <<EOF
export const GAME_VERSION = '$VERSION_STAMP';
export const GAME_TITLE = \`PenguDive \${GAME_VERSION}\`;
EOF

sed -i -E \
  -e "s|<title>PenguDive[^<]*</title>|<title>$GAME_FULL_NAME</title>|g" \
  -e "s|<h1 id=\"game-main-title\">PenguDive[^<]*</h1>|<h1 id=\"game-main-title\">$GAME_FULL_NAME</h1>|g" \
  "$PROJECT_DIR/index.html"

echo "==> Staging $GAME_FULL_NAME runtime bundle..."
PAYLOAD_ROOT="$STAGE_DIR/payload"
mkdir -p "$PAYLOAD_ROOT/app/vendor/three"

cp -r "$PROJECT_DIR/src" "$PAYLOAD_ROOT/app/src"
cp -r "$PROJECT_DIR/assets" "$PAYLOAD_ROOT/app/assets"

# Rewrite importmap in staged index.html to point to compact self-contained vendor/three
sed 's|\./node_modules/three/build/three\.module\.js|./vendor/three/three.module.js|g' \
  "$PROJECT_DIR/index.html" > "$PAYLOAD_ROOT/app/index.html"

cp "$PROJECT_DIR/node_modules/three/build/three.module.js" "$PAYLOAD_ROOT/app/vendor/three/"
cp "$PROJECT_DIR/node_modules/three/build/three.core.js" "$PAYLOAD_ROOT/app/vendor/three/"

cp "$PROJECT_DIR/packaging/pengudive-launcher.sh" "$PAYLOAD_ROOT/pengudive"
cp "$PROJECT_DIR/packaging/pengudive-uninstall.sh" "$PAYLOAD_ROOT/pengudive-uninstall"
chmod +x "$PAYLOAD_ROOT/pengudive" "$PAYLOAD_ROOT/pengudive-uninstall"

mkdir -p "$DIST_DIR"
# Remove previous builds in dist/ so only the latest versioned installers remain
rm -f "$DIST_DIR"/PenguDive-Setup*.run "$DIST_DIR"/pengudive_*.deb

# 1. Build Self-Extracting Single-File Linux Setup (.run)
RUN_INSTALLER="$DIST_DIR/PenguDive-Setup-$VERSION_STAMP.run"
TAR_GZ="$STAGE_DIR/payload.tar.gz"
tar -czf "$TAR_GZ" -C "$PAYLOAD_ROOT" .

sed "s/__VERSION_STAMP__/$VERSION_STAMP/g" "$PROJECT_DIR/packaging/setup-stub.sh" > "$RUN_INSTALLER"
base64 "$TAR_GZ" >> "$RUN_INSTALLER"
chmod +x "$RUN_INSTALLER"

echo "  [OK] Built self-extracting installer: $RUN_INSTALLER ($(du -h "$RUN_INSTALLER" | cut -f1))"

# 2. Build Debian/Ubuntu Package (.deb)
if command -v dpkg-deb >/dev/null 2>&1; then
  DEB_ROOT="$STAGE_DIR/deb/pengudive_${VERSION_STAMP}_all"
  mkdir -p \
    "$DEB_ROOT/DEBIAN" \
    "$DEB_ROOT/usr/lib/pengudive" \
    "$DEB_ROOT/usr/bin" \
    "$DEB_ROOT/usr/share/applications" \
    "$DEB_ROOT/usr/share/icons/hicolor/256x256/apps" \
    "$DEB_ROOT/usr/share/icons/hicolor/scalable/apps"

  cp -r "$PAYLOAD_ROOT/app" "$DEB_ROOT/usr/lib/pengudive/app"
  cp "$PAYLOAD_ROOT/pengudive" "$DEB_ROOT/usr/lib/pengudive/pengudive"
  chmod 0755 "$DEB_ROOT/usr/lib/pengudive/pengudive"
  ln -s ../lib/pengudive/pengudive "$DEB_ROOT/usr/bin/pengudive"

  # Also include a convenient pengudive-uninstall helper explaining apt remove if invoked on .deb install
  cat > "$DEB_ROOT/usr/bin/pengudive-uninstall" <<'UNEOF'
#!/usr/bin/env bash
echo "PenguDive was installed via the Ubuntu .deb package."
echo "Uninstalling with: sudo apt remove pengudive"
exec sudo apt remove pengudive "$@"
UNEOF
  chmod 0755 "$DEB_ROOT/usr/bin/pengudive-uninstall"

  cp "$PAYLOAD_ROOT/app/assets/pengudive.png" "$DEB_ROOT/usr/share/icons/hicolor/256x256/apps/pengudive.png"
  cp "$PAYLOAD_ROOT/app/assets/pengudive.svg" "$DEB_ROOT/usr/share/icons/hicolor/scalable/apps/pengudive.svg"

  cat > "$DEB_ROOT/usr/share/applications/pengudive.desktop" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=$GAME_FULL_NAME
GenericName=3D Polar Ocean Game
Comment=Swim as a penguin in the polar sea with playful seals (Keyboard + Xbox Controller)!
Exec=/usr/bin/pengudive
Icon=pengudive
Terminal=false
Categories=Game;ArcadeGame;ActionGame;
Keywords=penguin;seal;ocean;3d;game;xbox;controller;
StartupWMClass=PenguDive
StartupNotify=true
EOF

  INSTALLED_KB="$(du -sk "$DEB_ROOT/usr" | cut -f1)"
  cat > "$DEB_ROOT/DEBIAN/control" <<EOF
Package: pengudive
Version: $VERSION_STAMP
Section: games
Priority: optional
Architecture: all
Depends: python3
Recommends: google-chrome-stable | chromium-browser | firefox
Installed-Size: $INSTALLED_KB
Maintainer: PenguDive Studio <dev@localhost>
Description: $GAME_FULL_NAME - 3D Polar Sea Adventure Game
 Swim through crystal polar waters as an agile 3D penguin alongside playful
 harbor seals and patrolling leopard seals. Supports Xbox 360 Controller and keyboard.
EOF

  DEB_OUT="$DIST_DIR/pengudive_${VERSION_STAMP}_all.deb"
  dpkg-deb --root-owner-group --build "$DEB_ROOT" "$DEB_OUT" >/dev/null
  echo "  [OK] Built Debian/Ubuntu package:     $DEB_OUT ($(du -h "$DEB_OUT" | cut -f1))"
fi
