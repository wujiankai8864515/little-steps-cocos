#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if command -v node >/dev/null 2>&1; then
  node tools/check-types.cjs
  node --test tests/*.test.cjs
else
  creator="${COCOS_CREATOR:-/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator}"
  ELECTRON_RUN_AS_NODE=1 "$creator" tools/check-types.cjs
  ELECTRON_RUN_AS_NODE=1 "$creator" --test tests/*.test.cjs
fi
python3 tools/check-assets.py
