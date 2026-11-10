#!/usr/bin/env bash
# Rebuilds the code map (graphify-out/) at session start.
# Free (no model calls). Quiet, time-limited, and it never blocks the session.
cd "$(dirname "$0")/.." 2>/dev/null || exit 0
export PATH="$HOME/.local/bin:$PATH"
if ! command -v graphify >/dev/null 2>&1; then
  command -v uv >/dev/null 2>&1 && timeout 60 uv tool install -q graphifyy==0.9.102 >/dev/null 2>&1
fi
command -v graphify >/dev/null 2>&1 || exit 0
timeout 120 graphify update . >/dev/null 2>&1
exit 0
