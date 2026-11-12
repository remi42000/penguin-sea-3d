#!/usr/bin/env bash
set -euo pipefail

# Resolve real location of this launcher (follows symlinks from ~/.local/bin or /usr/bin)
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
INSTALL_ROOT="$(cd -P "$(dirname "$SOURCE")" && pwd)"
APP_DIR="$INSTALL_ROOT/app"

if [ ! -f "$APP_DIR/index.html" ]; then
  echo "Error: PenguDive game files not found at $APP_DIR" >&2
  exit 1
fi

PORT_FILE="$(mktemp "${TMPDIR:-/tmp}/pengudive-port.XXXXXX")"
SERVER_PID=""

cleanup() {
  rm -f "$PORT_FILE"
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# Start embedded localhost static server on an ephemeral free port (127.0.0.1:0)
if command -v python3 >/dev/null 2>&1; then
  python3 - "$APP_DIR" "$PORT_FILE" <<'PYEOF' &
import functools
import http.server
import socketserver
import sys

app_dir, port_file = sys.argv[1], sys.argv[2]

class QuietGameHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.ico': 'image/x-icon',
    }
    def log_message(self, format, *args):
        pass

handler = functools.partial(QuietGameHandler, directory=app_dir)
with socketserver.TCPServer(("127.0.0.1", 0), handler) as httpd:
    port = httpd.server_address[1]
    with open(port_file, "w", encoding="utf-8") as f:
        f.write(str(port))
        f.flush()
    httpd.serve_forever()
PYEOF
  SERVER_PID=$!
elif command -v node >/dev/null 2>&1; then
  node - "$APP_DIR" "$PORT_FILE" <<'NODEEOF' &
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const [appDir, portFile] = process.argv.slice(2);
const mimes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const srv = http.createServer((req, res) => {
  const rel = decodeURIComponent((req.url || '/').split('?')[0]);
  const safe = rel === '/' ? 'index.html' : rel.replace(/^\/+/, '');
  const fp = path.resolve(appDir, safe);
  if (!fp.startsWith(appDir)) { res.writeHead(403); return res.end(); }
  fs.stat(fp, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': mimes[path.extname(fp)] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  });
});
srv.listen(0, '127.0.0.1', () => {
  fs.writeFileSync(portFile, String(srv.address().port));
});
NODEEOF
  SERVER_PID=$!
else
  MSG="PenguDive requires python3 or nodejs to run."
  echo "$MSG" >&2
  command -v zenity >/dev/null 2>&1 && zenity --error --title="PenguDive" --text="$MSG" || true
  exit 1
fi

# Wait up to 4 seconds for server to bind and write its ephemeral port
PORT=""
for _ in $(seq 1 40); do
  if [ -s "$PORT_FILE" ]; then
    PORT="$(cat "$PORT_FILE")"
    break
  fi
  sleep 0.1
done

if [ -z "$PORT" ]; then
  echo "Error: Failed to start local game server." >&2
  exit 1
fi

URL="http://127.0.0.1:$PORT"

# Smoke-test mode (verifies installed payload & server health without opening a GUI window)
if [ "${1:-}" = "--smoke-test" ]; then
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "$URL/" >/dev/null
    curl -fsS "$URL/src/main.js" >/dev/null
    curl -fsS "$URL/vendor/three/three.module.js" >/dev/null
  else
    python3 -c "import urllib.request; urllib.request.urlopen('$URL/').read()"
  fi
  echo "OK: PenguDive server verified at $URL (APP_DIR=$APP_DIR)"
  exit 0
fi

# Find a Chromium/Chrome browser capable of standalone chromeless desktop --app window
APP_BROWSER=""
if [ "${1:-}" != "--browser" ]; then
  for candidate in google-chrome google-chrome-stable chromium chromium-browser brave-browser microsoft-edge; do
    if command -v "$candidate" >/dev/null 2>&1; then
      APP_BROWSER="$(command -v "$candidate")"
      break
    fi
  done
fi

if [ -n "$APP_BROWSER" ]; then
  PROFILE_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/pengudive/window-profile"
  mkdir -p "$PROFILE_DIR"
  echo "Launching PenguDive window ($URL)..."
  "$APP_BROWSER" \
    --app="$URL" \
    --user-data-dir="$PROFILE_DIR" \
    --class=PenguDive \
    --window-size=1280,800 \
    --autoplay-policy=no-user-gesture-required \
    --no-first-run \
    --no-default-browser-check \
    --disable-extensions \
    >/dev/null 2>&1 || true
else
  echo "Opening PenguDive 3D in your default browser ($URL)..."
  echo "Press Ctrl+C to stop the game server when finished."
  xdg-open "$URL" >/dev/null 2>&1 || true
  wait "$SERVER_PID"
fi
