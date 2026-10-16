#!/usr/bin/env bash
export PATH="/Users/home/.local/opt/node-v20.18.0-darwin-x64/bin:$PATH"
cd "$(dirname "$0")"
./node_modules/.bin/electron . "$@"
