#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node --test scripts/harness/harness.check.mjs
