#!/usr/bin/env sh
# Starts the overlay: installs on the first run, builds, opens the control
# panel, and keeps the server running until Ctrl+C.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install the LTS version from https://nodejs.org and run this again."
  exit 1
fi
if ! node -e "process.exit(Number(process.versions.node.split('.')[0]) < 22 ? 1 : 0)"; then
  echo "Node.js 22 or newer is needed. Install the LTS version from https://nodejs.org and run this again."
  exit 1
fi

# The game's PDFs go here (see SETUP.md).
mkdir -p data/artifacts

if [ ! -d node_modules ]; then
  echo "Installing, first run only. This takes a minute or two..."
  npm install --no-audit --no-fund
fi

echo "Building..."
npm run build --silent

PORT="${PORT:-7777}"
export PORT
echo
echo "Control panel: http://localhost:$PORT/control"
echo "Overlay for OBS: http://localhost:$PORT/overlay"
echo "Press Ctrl+C to stop."
echo
(sleep 4; if command -v open >/dev/null 2>&1; then open "http://localhost:$PORT/control"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "http://localhost:$PORT/control"; fi) >/dev/null 2>&1 &
npm start
