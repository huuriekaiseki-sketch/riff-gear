#!/usr/bin/env bash
# aidd-phase2ワークフローの「テスト選択」機械導出の回帰テスト。
# hooks-test CIジョブが scripts/*.test.sh を全件実行する仕組みに乗せるためのラッパー。
# 本体が.check.mjsなのは、.test.mjsだとvitestのデフォルトinclude(**/*.test.*)に拾われて
# 「No test suite found」でtestジョブがfailするため(素のnodeスクリプトでvitest非依存)。
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/aidd-phase2-workflow.check.mjs
