#!/bin/bash
# mrd 全端点回归冒烟测试 — 重构前后各跑一次对比
# 用法: bash scripts/smoke_test.sh [输出文件]
OUT="${1:-/tmp/mrd-smoke-$(date +%H%M%S).txt}"
BASE="${2:-http://localhost:3000}"
echo "=== mrd smoke test $(date '+%F %T') ===" > "$OUT"
echo "base: $BASE" >> "$OUT"
PASS=0; FAIL=0; FAILED=()

check() {
  local name="$1" url="$2"
  local code body
  body=$(curl -s --max-time 20 -o /tmp/smoke-body.json -w "%{http_code}" "$BASE$url" 2>/dev/null)
  code=$?
  if [ "$code" = "0" ] && [ "$body" = "200" ]; then
    # JSON 有效性
    if python3 -c "import json;json.load(open('/tmp/smoke-body.json'))" 2>/dev/null; then
      echo "PASS  $name  ($url)" >> "$OUT"
      PASS=$((PASS+1))
    else
      echo "FAIL  $name  ($url) — HTTP $body but invalid JSON" >> "$OUT"
      FAIL=$((FAIL+1)); FAILED+=("$name")
    fi
  else
    echo "FAIL  $name  ($url) — HTTP ${body:-timeout}" >> "$OUT"
    FAIL=$((FAIL+1)); FAILED+=("$name")
  fi
}

# 无参端点
check health /api/health
check stats /api/stats
check news /api/news
check rank /api/rank
check boards /api/boards
check spot-table /api/spot-table
check spend-index /api/spend-index
check treasuries /api/treasuries
check treasury-history /api/treasury-history
check moneyflow /api/moneyflow
check board-flow /api/board-flow
check aa-models /api/aa-models

# 带参端点
check quotes "/api/quotes?codes=sh000001,sz399001,hf_GC"
check minute "/api/minute?code=sh000001"
check batch-minute "/api/batch-minute?codes=sh000001,sz399001"
check batch-fmin "/api/batch-fmin?codes=sh000001,sz399001"
check futures "/api/futures?list=hf_GC,hf_XAU"
check future-minute "/api/future-minute?code=hf_GC"
check future-daily "/api/future-daily?code=hf_GC"
check stock-boards "/api/stock-boards?code=sh600519"
check stock-flow "/api/stock-flow?code=sh600519"
check stock-flows "/api/stock-flows?codes=sh600519,sz000001"
check stock-search "/api/stock-search?kw=茅台"
check finance-main "/api/finance-main?code=sh600519"
check finance-board "/api/finance-board?code=sh600519"
check finance-forecast "/api/finance-forecast?code=sh600519"
check chem-spot "/api/chem-spot?code=1234"
check mystery-select "/api/mystery-select?q=贵州茅台"

# POST 端点
check chain-parse-post "/api/chain-parse" # POST 需带 body, 单独处理
body=$(curl -s --max-time 20 -X POST -H "Content-Type: application/json" -d '{"name":"测试链","content":"上游: 公司A,公司B\n中游: 公司C"}' -o /tmp/smoke-body.json -w "%{http_code}" "$BASE/api/chain-parse" 2>/dev/null)
if [ "$body" = "200" ] && python3 -c "import json;json.load(open('/tmp/smoke-body.json'))" 2>/dev/null; then
  echo "PASS  chain-parse-post  (/api/chain-parse)" >> "$OUT"; PASS=$((PASS+1))
else
  echo "FAIL  chain-parse-post  (/api/chain-parse) — HTTP $body" >> "$OUT"; FAIL=$((FAIL+1)); FAILED+=("chain-parse-post")
fi

# openrouter-usage (需 key, 可能 500 属预期)
code=$(curl -s --max-time 20 -o /dev/null -w "%{http_code}" "$BASE/api/openrouter-usage" 2>/dev/null)
if [ "$code" = "200" ] || [ "$code" = "500" ]; then
  echo "PASS  openrouter-usage  (/api/openrouter-usage) — HTTP $code (500=无key属预期)" >> "$OUT"; PASS=$((PASS+1))
else
  echo "FAIL  openrouter-usage  (/api/openrouter-usage) — HTTP $code" >> "$OUT"; FAIL=$((FAIL+1)); FAILED+=("openrouter-usage")
fi

echo "" >> "$OUT"
echo "=== 结果: $PASS 通过 / $FAIL 失败 ===" >> "$OUT"
echo "失败项: ${FAILED[*]:-无}" >> "$OUT"
cat "$OUT"
exit $FAIL
