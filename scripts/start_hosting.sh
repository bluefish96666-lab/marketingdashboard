#!/bin/bash
# mrd 托管版 · 本机内测实例 一键启动/重启脚本
# 用法:
#   bash scripts/start_hosting.sh          # 构建前端 + 启动/重启 pm2 实例 mrd-host(:3200)
#   PORT=3100 bash scripts/start_hosting.sh # 自定义端口(默认 3200)
#
# 红线: 仅本机/局域网内测访问(无公网隧道、无域名、无收款链路)
set -e
cd "$(dirname "$0")/.."

PORT="${PORT:-3200}"
PM2_HOME="${PM2_HOME:-/home/gavin/.pm2}"

echo "[1/2] 构建前端产物 (npm run build)..."
npm run build

echo "[2/2] 启动/重启 pm2 实例 mrd-host (PORT=$PORT, HOSTING=1)..."
if PM2_HOME="$PM2_HOME" pm2 describe mrd-host >/dev/null 2>&1; then
  PM2_HOME="$PM2_HOME" PORT="$PORT" HOSTING=1 pm2 restart mrd-host --update-env
else
  PM2_HOME="$PM2_HOME" PORT="$PORT" HOSTING=1 pm2 start server/index.cjs --name mrd-host --cwd "$PWD"
fi

sleep 2
echo ""
echo "本机访问地址: http://localhost:$PORT  (局域网内测: http://<本机IP>:$PORT)"
curl -s --max-time 5 "http://localhost:$PORT/api/hosting/config" && echo "" || echo "⚠️  健康检查未通过, 请查看: PM2_HOME=$PM2_HOME pm2 logs mrd-host"
