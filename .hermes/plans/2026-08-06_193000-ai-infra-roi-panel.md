# AI 基础设施资本出清与复合 ROI 面板 — 实施计划

**Goal:** 在 AI 观察页新增"AI 基础设施资本出清与复合 ROI 动态跟踪"面板，绘制 2022-2035 五条曲线：云巨头 IT 资本开支、电网就绪度、百万 token 生产成本、百万 token 售价、复合财务 ROI（历史跟踪 + 预测）。

**Architecture:** 数据分三层——(1) 真实历史段由**公开免费端点实时拉取**（SEC/OpenRouter/FRED，均已验证可达）；(2) 预测段由后端 `sources/ai-infra.cjs` 参数化模型生成；(3) 前端 `InfraRoiPanel.tsx` 消费单一 `/api/ai-infra` 端点渲染。**铁律：历史实线 / 预测虚线严格区分，预测标"模型假设"，估算标"估算"**——Gavin 数据准确癖，绝不伪装。

**Tech Stack:** Node cjs 后端（零依赖，复用 curlText/fetchText/readHistory/writeHistory）+ React 19 SVG 手绘 + vitest。无新依赖。

---

## 数据源（已验证 ✓ / 待验证 ⚠️）

### 1. 云巨头 CapEx 与折旧（分母） — ✅ 已验证
- **端点**：SEC companyfacts API `https://data.sec.gov/api/xbrl/companyfacts/CIK{CIK}.json`（免费免密钥，需 UA 头）
- **CIK**：MSFT `0000789019`、GOOGL `0001652044`、AMZN `0001018724`、META `0001326801`
- **实测**（MSFT，真实财报）：`PaymentsToAcquirePropertyPlantAndEquipment` 2023 $28.1B / 2024 $44.5B / 2025 $64.6B / 2026 $115.9B（注意：MSFT 用此标签，非 CapitalExpenditures——各公司标签名需探测 fallback）
- **折旧**：`DepreciationAndAmortization`（需逐家探测实际标签）
- **实现**：`sources/sec-capex.cjs` 按季度拉取 4 家，聚合为年度序列，缓存 24h（财报披露频率低）
- **前瞻指标**：台积电月度营收（TWSE 公告）+ 广达/纬创出货 → 2 季度前导（⚠️ 待验证抓取方式，作加分项）

### 2. 电网就绪度（物理瓶颈） — ⚠️ 部分可达
- **权威年度**：LBNL《Queued Up》CSV（`https://emp.lbl.gov/queues`）— **实测 403**（WAF 反爬，需浏览器 UA/真实会话，规划为月度人工下载或 headless 抓取）
- **月度动态**：PJM/ERCOT GIS 报告 .xlsx（过滤 `Project Type` 含 `Load - Data Center` 的行，计算 `In Progress` 排队天数均值）— **实测 403/网络不通**，同上处理
- **降级方案**：首版用 LBNL 年度数据（公开论文附录常含表格）锚定 2022-2025 + 模型外推；月度 PJM/ERCOT 作为二期管道
- **合成指数定义**：`gridReadiness = 100 × 已批准并网容量 / 数据中心需求容量`，[0,100]，method 字段 UI 可见

### 3. Token 生产成本 vs 售价（分子） — ✅ 已验证
- **售价**：OpenRouter `https://openrouter.ai/api/v1/models`（免费 GET）— **实测通过**，返回 `pricing.prompt/completion`（如 deepseek $0.09/M in、$0.18/M out）。已有 openrouter-usage.json 管道可复用
- **生产成本**：厂商不披露 → 模型估算（历史锚点：2022 GPT-3 级 ~$25/M → 2025 DeepSeek 级 ~$0.3/M，公开研究）+ `costDecline` -42%/年
- **硬件通胀**：FRED `PCU334413334413`（半导体 PPI）— **实测通过**（1967 起全历史 CSV）。PPI 掉头向下 = 供应链成本缓解信号，作成本模型修正因子

### 4. 复合财务 ROI
- **定义**：`ROI_t = (Σ AI收入[2022..t] − Σ CapEx[2022..t]) / Σ CapEx[2022..t]`
- **收入端**：四家云/AI 业务收入（SEC `Revenues` 细分 + 财报指引），口径标注"云业务收入近似"
- **叙事**：2022-2026 深度负值（资本出清期）→ 拐点 2028 → 转正 2030+（模型假设）

---

## 实施步骤

### Task 1: SEC CapEx 拉取器 `sources/sec-capex.cjs`

**Files:**
- Create: `server/sources/sec-capex.cjs`（~90 行）
- Modify: `server/index.cjs`（组装 + 路由）

**Step 1:** 标签探测：对每家尝试 `PaymentsToAcquirePropertyPlantAndEquipment` → fallback `CapitalExpenditures` → fallback `PaymentsForPropertyPlantAndEquipment`，取非空者。
**Step 2:** 季度序列 → 年度聚合（10-K 年度值直接取，避免季度重复累加）。
**Step 3:** 单测（vitest）：mock fetch 返回固定 JSON，断言标签 fallback 与年度聚合正确。
**Step 4:** 冒烟 `check ai-infra /api/ai-infra`。

### Task 2: Token 价格拉取 `sources/token-prices.cjs`

**Files:**
- Create: `server/sources/token-prices.cjs`（~60 行）

**Step 1:** GET openrouter.ai/api/v1/models，提取每模型 `pricing.prompt/completion`，按厂商聚合加权均价（美元/百万 token）。
**Step 2:** 历史锚点表（2022-2024 定价史：GPT-3 $60/M → GPT-4 $30/M → GPT-4o $5/M）+ 当前实时价（2025+）。
**Step 3:** 与 model-prices.json 现有积累交叉校验。

### Task 3: FRED PPI 修正因子 `sources/fred-ppi.cjs`

**Files:**
- Create: `server/sources/fred-ppi.cjs`（~40 行）

**Step 1:** 拉取 `PCU334413334413` CSV（fredgraph.csv?id=...），取最近 12 个月 YoY。
**Step 2:** 输入成本模型：`costAdjust = ppiYoY 上升→成本下降放缓，下降→加速`。

### Task 4: 预测模型 + 聚合 `sources/ai-infra.cjs`

**Files:**
- Create: `server/sources/ai-infra.cjs`（~120 行，聚合 1-3 + 预测）

**Step 1:** `MODEL` 参数表集中（capexGrowth 数组 / costDecline / priceDecline / gridCapCagr / revenueCagr / roiCrossover）。
**Step 2:** `computeSeries()` 纯函数：历史（SEC/OpenRouter 实测 + 锚点表）+ 预测（参数外推），返回 `{ year, capex, grid, costPerM, pricePerM, roi, actual }[]`。
**Step 3:** 单测：锚点透传、预测单调、ROI 拐点年、actual 标记。

### Task 5: 前端面板（单图多轴剪刀差）

**Files:**
- Create: `src/components/dash/InfraRoiPanel.tsx`（~380 行）+ `infra-chart-math.ts`（图计算纯函数）
- Modify: `src/lib/api.ts`、`src/AiDashboard.tsx`（CELLS 布局，**用户确认：压缩 Token 消耗面板高度，新面板放左下空区**）

**布局变更**（AiGrid 2×3 → 2×2 配置）：
- `openrouter`（Token 消耗）：`lg:col-start-1 lg:row-start-1`（去掉 `row-span-2`，压缩为左上单格）
- **新增 `ai-infra`**：`lg:col-start-1 lg:row-start-2`（左下空区，高度受单格限制，图表紧凑）
- `ttsi-trend`/`price-events`：右上（col-2/3, row-1）
- `price-table`/`value-scatter`：中右（col-2/3, row-2）

**设计（用户确认：非 tab 页，一张融合多维度剪刀差图）**：

- **主视觉——剪刀差核心**：左轴（对数刻度）画两条线——Token 生产成本 vs 售价。对数轴让指数衰减变直线，两条线的开合即"剪刀差"形态；售价线在成本线上方 = 毛利扩张，交叉/逼近 = 剪刀闭合（资本出清信号）
- **右轴叠加**：复合 ROI % 线（第三轴, 与剪刀差同图, 线型区分）
- **可选叠加（checkbox 开关）**：CapEx（$B，右轴）与电网就绪度（0-100，右轴）——默认关闭，勾选叠加，避免信息过载
- **交互**：hover 十字准线 + tooltip（年份/各线值/口径标注：实测/估算/合成/预测）
- **历史实线 / 预测虚线**，预测区背景微透明覆盖标注"预测"
- **图例**：左下角系列开关 + 颜色点

**轴与比例**：`infra-chart-math.ts` 纯函数处理——log 左轴刻度计算、右轴双系列归一化（ROI 与 CapEx/电网不同量纲，右轴按选中系列自动缩放）、实/虚分段 path 生成。

**Step 1:** 单测 `infra-chart-math.ts`（log 刻度、分段 path、右轴缩放）。
**Step 2:** 面板 JSX：图例开关 + SVG 多轴渲染 + tooltip。
**Step 3:** 复用 Panel 字号体系（11px 数据/9px 标签），OpenRouterPanel 交互模式。

### Task 6: 集成 + 回归

**Files:**
- Modify: `scripts/smoke_test.sh`（+ai-infra）

**Step 1:** build + test（新旧全绿）+ 冒烟 31 过/3 上游失败。
**Step 2:** 部署 + 浏览器验证（5 tab/实虚线/tooltip/移动端）。

---

## Files to Change 汇总

| 文件 | 动作 |
|------|------|
| `server/sources/sec-capex.cjs` | Create（SEC CapEx/折旧） |
| `server/sources/token-prices.cjs` | Create（OpenRouter 定价） |
| `server/sources/fred-ppi.cjs` | Create（FRED PPI 修正） |
| `server/sources/ai-infra.cjs` | Create（聚合 + 预测模型） |
| `server/ai-infra.test.js` | Create（单测） |
| `server/index.cjs` | Modify（路由） |
| `src/lib/api.ts` | Modify（api.aiInfra + 类型） |
| `src/components/dash/InfraRoiPanel.tsx` | Create |
| `src/components/dash/infra-chart-math.ts` | Create |
| `src/AiDashboard.tsx` | Modify |
| `scripts/smoke_test.sh` | Modify |

## 验证

- 单测：SEC 标签 fallback/年度聚合、预测单调/ROI 拐点、现有 21 用例全绿
- 冒烟：31 过/3 上游失败（+ai-infra 新端点）
- 浏览器：5 tab/实虚线/tooltip 口径标注/移动端

## 风险与开放问题

1. **SEC 标签不一致**（已验证）：MSFT 用 `PaymentsToAcquirePropertyPlantAndEquipment` 而非 `CapitalExpenditures`，需逐家探测 fallback；个别公司折旧标签可能缺失。
2. **电网数据 403**（已验证）：PJM/ERCOT/LBNL 均被 WAF 拦截 → 首版用 LBNL 年度公开数字锚定 + 模型外推，月度管道二期做（需 headless 浏览器或人工下载）。
3. **代理不稳**：sing-box 节点 IPv6 不可达（今天多次 000），SEC/OpenRouter/FRED 走直连均通（SEC 实测 200/4.9MB），无需代理。
4. **成本为估算**：厂商不披露真实生产成本，模型锚点来自公开研究，UI 必须标"估算"。
5. **ROI 口径**：收入端用云业务收入近似，标注简化。
6. **布局**：2×3 网格已满 → 占底部整行（建议）。

## 前置确认（已确认 ✅）

1. ✅ 电网就绪度首版"LBNL 年度锚点 + 模型外推"，PJM/ERCOT 月度管道二期
2. ✅ 布局：压缩 Token 消耗面板（去 row-span-2），新面板放左下空区
3. ✅ 图表：**一张融合多维度的剪刀差折线图**（非 tab 页）——左轴 log 成本 vs 售价剪刀差 + 右轴 ROI 叠加 + CapEx/电网可选开关

## 实施范围（最终版）

| Task | 内容 | 行数估计 |
|------|------|---------|
| 1 | `sec-capex.cjs`（SEC 四家 CapEx/折旧，标签 fallback） | ~90 |
| 2 | `token-prices.cjs`（OpenRouter 实时定价 + 历史锚点） | ~60 |
| 3 | `fred-ppi.cjs`（FRED 半导体 PPI 修正因子） | ~40 |
| 4 | `ai-infra.cjs`（聚合 + 预测模型 + `/api/ai-infra` 路由） | ~120 |
| 5 | `ai-infra.test.js`（vitest：标签 fallback/聚合/预测/ROI） | ~60 |
| 6 | `InfraRoiPanel.tsx` + `infra-chart-math.ts`（单图多轴剪刀差） | ~380 + ~120 |
| 7 | `api.ts` + `AiDashboard.tsx`（CELLS 压缩布局） | ~30 |
| 8 | 冒烟 + 部署 + 浏览器验证 | - |

数据源：SEC/OpenRouter/FRED 直连已验证；电网用 LBNL 年度锚点 + 外推。
验证：单测全绿 + 冒烟 31 过/3 上游失败 + 浏览器 5 线交互 + 实虚线边界。

