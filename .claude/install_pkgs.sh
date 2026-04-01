#!/bin/bash
# リモート環境（CC on Web）でのみ実行
if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

# -------------------------------------------------------
# Node.js / pnpm のセットアップ
# package.json で pnpm@10.30.0 が固定されているため corepack で有効化
# -------------------------------------------------------
corepack enable
corepack prepare pnpm@10.30.0 --activate

# -------------------------------------------------------
# Python 環境のセットアップ
# apps/api の Cloudflare Workers Python ワーカー、または
# スクリプト類の実行に必要
# -------------------------------------------------------
apt-get install -y -q python3 python3-pip python3-venv

# uv が使われている場合は pip 経由でインストール
pip3 install uv --quiet

# -------------------------------------------------------
# モノレポの依存関係を一括インストール（ルートで実行）
# apps/* と packages/* 配下の全パッケージを対象
# -------------------------------------------------------
cd "$CLAUDE_PROJECT_DIR"
pnpm install
pnpm build
