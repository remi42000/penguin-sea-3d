#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/pengudive"
BIN_LINK="$HOME/.local/bin/pengudive"
UNINSTALL_LINK="$HOME/.local/bin/pengudive-uninstall"
DESKTOP_ENTRY="${XDG_DATA_HOME:-$HOME/.local/share}/applications/pengudive.desktop"
ICON_PNG="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/256x256/apps/pengudive.png"
ICON_SVG="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/scalable/apps/pengudive.svg"

if [ "${1:-}" != "--yes" ] && [ "${1:-}" != "-y" ] && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] && command -v zenity >/dev/null 2>&1; then
  if ! zenity --question --title="Uninstall PenguDive" --width=380 \
    --text="Are you sure you want to uninstall PenguDive from your account?"; then
    exit 0
  fi
fi

rm -rf "$INSTALL_DIR"
rm -f "$BIN_LINK" "$UNINSTALL_LINK" "$DESKTOP_ENTRY" "$ICON_PNG" "$ICON_SVG"
rm -f "$HOME/Desktop"/PenguDive*.desktop

command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "${XDG_DATA_HOME:-$HOME/.local/share}/applications" 2>/dev/null || true

echo "PenguDive has been cleanly uninstalled."
if [ "${1:-}" != "--yes" ] && [ "${1:-}" != "-y" ] && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] && command -v zenity >/dev/null 2>&1; then
  zenity --info --title="PenguDive Uninstalled" --width=340 --text="PenguDive has been removed." || true
fi
