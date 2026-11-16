#!/bin/sh
# Builds the ChatGPT directory package: plugin.json, mcp.json, skills and assets.
# Leaves out the Claude-only files (.claude-plugin/, .mcp.json), which the
# directory's validator does not read.
set -eu
cd "$(dirname "$0")/../plugin"
out="${1:-../dist/composer-nb-plugin.zip}"
mkdir -p "$(dirname "$out")"
rm -f "$out"
zip -qr -X "$out" plugin.json mcp.json README.md skills assets
echo "$out"
