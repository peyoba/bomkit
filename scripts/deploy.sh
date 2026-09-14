#!/usr/bin/env bash
# 本地一键构建并直接部署到 Cloudflare，无需登录网页控制台
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> 1. 本地执行完整构建..."
bash scripts/cloudflare-build.sh

echo "==> 2. 使用 Wrangler 自动推送到 Cloudflare..."
npx wrangler deploy

echo "==> 部署成功完成！"
