#!/usr/bin/env bash
# ==============================================================================
# PenguDive __VERSION_STAMP__ — Self-Extracting Linux Setup Installer
# ==============================================================================
set -euo pipefail

APP_VERSION="__VERSION_STAMP__"
APP_NAME="PenguDive $APP_VERSION"

AUTO_YES=0
FORCE_CLI=0
WANT_MENU=1
WANT_BIN=1
WANT_DESKTOP=0
PLAY_AFTER=0
DO_UNINSTALL=0

for arg in "$@"; do
  case "$arg" in
    -y|--yes|--non-interactive)
      AUTO_YES=1
      ;;
    --cli)
      FORCE_CLI=1
      ;;
    --desktop-shortcut)
      WANT_DESKTOP=1
      ;;
    --no-menu)
      WANT_MENU=0
      ;;
    --play)
      PLAY_AFTER=1
      ;;
    --uninstall)
      DO_UNINSTALL=1
      ;;
    -h|--help)
      cat <<EOF
$APP_NAME — Linux Setup

Usage: $(basename "$0") [options]

Options:
  (no flags)           Launch interactive GUI/CLI Setup Wizard
  -y, --yes            Quick non-interactive installation
  --desktop-shortcut   Also place a launcher icon on ~/Desktop
  --play               Launch $APP_NAME immediately after installing
  --cli                Use terminal prompts instead of GUI dialogs
  --uninstall          Uninstall PenguDive from your account
  -h, --help           Show this help message
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (use --help for usage)" >&2
      exit 1
      ;;
  esac
done

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
INSTALL_DIR="$DATA_HOME/pengudive"
BIN_DIR="$HOME/.local/bin"
APPS_DIR="$DATA_HOME/applications"
ICON_PNG_DIR="$DATA_HOME/icons/hicolor/256x256/apps"
ICON_SVG_DIR="$DATA_HOME/icons/hicolor/scalable/apps"

if [ "$DO_UNINSTALL" -eq 1 ]; then
  if [ -x "$INSTALL_DIR/pengudive-uninstall" ]; then
    exec "$INSTALL_DIR/pengudive-uninstall" $([ "$AUTO_YES" -eq 1 ] && echo "--yes" || true)
  else
    rm -rf "$INSTALL_DIR"
    rm -f "$BIN_DIR/pengudive" "$BIN_DIR/pengudive-uninstall" \
          "$APPS_DIR/pengudive.desktop" \
          "$ICON_PNG_DIR/pengudive.png" "$ICON_SVG_DIR/pengudive.svg" \
          "$HOME/Desktop"/PenguDive*.desktop
    echo "$APP_NAME uninstalled."
    exit 0
  fi
fi

HAS_GUI=0
if [ "$AUTO_YES" -eq 0 ] && [ "$FORCE_CLI" -eq 0 ] && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] && command -v zenity >/dev/null 2>&1; then
  HAS_GUI=1
fi

if [ "$HAS_GUI" -eq 1 ]; then
  CHOICES="$(zenity --list --checklist \
    --title="$APP_NAME — Linux Setup" \
    --width=520 --height=350 \
    --text="Welcome to the <b>$APP_NAME</b> Installer!\n\nIncludes full Xbox 360 Controller + Keyboard support (no sudo required).\nChoose your setup options:" \
    --column="Enable" --column="Key" --column="Option" \
    --hide-column=2 --separator="|" \
    TRUE "MENU" "Add $APP_NAME to Applications Menu" \
    TRUE "BIN" "Add 'pengudive' & 'pengudive-uninstall' to ~/.local/bin" \
    TRUE "DESKTOP" "Create Desktop shortcut (~/Desktop)" \
    )" || exit 0

  WANT_MENU=0
  WANT_BIN=0
  WANT_DESKTOP=0
  [[ "|$CHOICES|" == *"|MENU|"* ]] && WANT_MENU=1
  [[ "|$CHOICES|" == *"|BIN|"* ]] && WANT_BIN=1
  [[ "|$CHOICES|" == *"|DESKTOP|"* ]] && WANT_DESKTOP=1
elif [ "$AUTO_YES" -eq 0 ]; then
  echo "========================================================"
  echo "  $APP_NAME — Linux Setup"
  echo "========================================================"
  echo "Install location: $INSTALL_DIR"
  echo ""
  if [ -t 0 ]; then
    read -r -p "Continue with installation? [Y/n] " ans
    case "${ans:-Y}" in
      [Nn]*) echo "Setup cancelled."; exit 0 ;;
    esac
    if [ -d "$HOME/Desktop" ]; then
      read -r -p "Create a Desktop shortcut on ~/Desktop? [y/N] " dans
      case "${dans:-N}" in
        [Yy]*) WANT_DESKTOP=1 ;;
      esac
    fi
  fi
fi

echo "Installing $APP_NAME to $INSTALL_DIR ..."
rm -rf "$INSTALL_DIR/app"
mkdir -p "$INSTALL_DIR"

# Extract embedded base64 tar.gz payload after marker line
sed '1,/^__PENGUDIVE_PAYLOAD_BASE64__$/d' "$0" | base64 -d | tar -xzf - -C "$INSTALL_DIR"

chmod +x "$INSTALL_DIR/pengudive" "$INSTALL_DIR/pengudive-uninstall"

# Install icons
mkdir -p "$ICON_PNG_DIR" "$ICON_SVG_DIR"
cp "$INSTALL_DIR/app/assets/pengudive.png" "$ICON_PNG_DIR/pengudive.png"
cp "$INSTALL_DIR/app/assets/pengudive.svg" "$ICON_SVG_DIR/pengudive.svg"

# Symlink CLI launcher & uninstaller
if [ "$WANT_BIN" -eq 1 ]; then
  mkdir -p "$BIN_DIR"
  ln -sf "$INSTALL_DIR/pengudive" "$BIN_DIR/pengudive"
  ln -sf "$INSTALL_DIR/pengudive-uninstall" "$BIN_DIR/pengudive-uninstall"
fi

DESKTOP_CONTENT="[Desktop Entry]
Version=1.0
Type=Application
Name=$APP_NAME
GenericName=3D Polar Ocean Game
Comment=Swim as a penguin in the polar sea with playful seals (Keyboard + Xbox Controller)!
Exec=$INSTALL_DIR/pengudive
Icon=$ICON_PNG_DIR/pengudive.png
Terminal=false
Categories=Game;ArcadeGame;ActionGame;
Keywords=penguin;seal;ocean;3d;game;xbox;controller;
StartupWMClass=PenguDive
StartupNotify=true
"

# Application Menu Launcher
if [ "$WANT_MENU" -eq 1 ]; then
  mkdir -p "$APPS_DIR"
  printf "%s" "$DESKTOP_CONTENT" > "$APPS_DIR/pengudive.desktop"
  chmod +x "$APPS_DIR/pengudive.desktop"
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS_DIR" 2>/dev/null || true
fi

# Optional Desktop Shortcut (replaces older PenguDive shortcuts cleanly & marks trusted)
if [ "$WANT_DESKTOP" -eq 1 ] && [ -d "$HOME/Desktop" ]; then
  rm -f "$HOME/Desktop"/PenguDive*.desktop
  SHORTCUT_PATH="$HOME/Desktop/PenguDive-$APP_VERSION.desktop"
  printf "%s" "$DESKTOP_CONTENT" > "$SHORTCUT_PATH"
  chmod +x "$SHORTCUT_PATH"
  command -v gio >/dev/null 2>&1 && gio set "$SHORTCUT_PATH" metadata::trusted true 2>/dev/null || true
fi

command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -f -t "$DATA_HOME/icons/hicolor" 2>/dev/null || true

echo ""
echo "Setup complete! ($APP_NAME)"
echo "  • Launch from terminal:  pengudive"
echo "  • Launch from App Menu:  $APP_NAME"
echo "  • Uninstall anytime:     pengudive-uninstall"

launch_game_detached() {
  if command -v setsid >/dev/null 2>&1; then
    setsid -f "$INSTALL_DIR/pengudive" >/dev/null 2>&1
  else
    nohup "$INSTALL_DIR/pengudive" >/dev/null 2>&1 &
    disown 2>/dev/null || true
  fi
}

if [ "$PLAY_AFTER" -eq 1 ]; then
  launch_game_detached
  exit 0
fi

if [ "$HAS_GUI" -eq 1 ]; then
  if zenity --question \
    --title="$APP_NAME Installed!" \
    --width=430 \
    --ok-label="Play Now!" \
    --cancel-label="Finish" \
    --text="<b>$APP_NAME</b> is ready to play!\n\nXbox 360 Controller is supported — press <b>A</b> or <b>START</b> on the title screen to dive in.\n\nLaunch right now?"; then
    launch_game_detached
  fi
elif [ "$AUTO_YES" -eq 0 ] && [ -t 0 ] && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  read -r -p "Launch $APP_NAME now? [Y/n] " play_ans
  case "${play_ans:-Y}" in
    [Nn]*) ;;
    *) launch_game_detached ;;
  esac
fi

exit 0
__PENGUDIVE_PAYLOAD_BASE64__
