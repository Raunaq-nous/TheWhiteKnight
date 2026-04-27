#!/bin/bash
set -e
echo "Syncing .claude/ to .agent/..."
rsync -av --delete .claude/ .agent/
cp CLAUDE.md AGENTS.md
echo "Sync complete"
