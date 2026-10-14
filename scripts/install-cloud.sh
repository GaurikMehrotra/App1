#!/usr/bin/env bash
set -euo pipefail
cd /workspace/App1
export XDG_DATA_HOME=/workspace/.data
export XDG_CACHE_HOME=/workspace/.cache
pnpm install --frozen-lockfile
