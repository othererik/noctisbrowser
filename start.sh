#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Automatically append common user-space Node/Homebrew paths if node is not already on PATH
if ! command -v node >/dev/null 2>&1; then
  for candidate in "$HOME/.local/bin" "/opt/homebrew/bin" "/usr/local/bin"; do
    if [ -d "$candidate" ]; then
      export PATH="$candidate:$PATH"
    fi
  done
  # Support ~/.local/opt/node-* installations for any user
  for nodedir in "$HOME"/.local/opt/node-*/bin; do
    if [ -d "$nodedir" ]; then
      export PATH="$nodedir:$PATH"
    fi
  done
fi

EXTRA_FLAGS=()
if [ "$(uname -s)" = "Linux" ]; then
  EXTRA_FLAGS+=("--no-sandbox" "--disable-setuid-sandbox")
fi

if [ -x "./node_modules/.bin/electron" ]; then
  exec ./node_modules/.bin/electron . "${EXTRA_FLAGS[@]}" "$@"
else
  exec npx --yes electron . "${EXTRA_FLAGS[@]}" "$@"
fi
