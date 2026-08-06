# mrd 代码整洁之道重构计划

> **Goal:** 按《代码整洁之道》逐步重构 mrd（后端上帝模块 + 前端超大组件），每阶段独立回归，不破坏现有功能。

**架构:** 后端 2290 行单文件 → lib/（通用工具）+ sources/（上游适配器）+ routes/static（薄入口）；前端超大组件 → 拆分 + 共享原语（ChartShell/useRetryPolling/colors/intervals）。

**回归基线:** `scripts/smoke_test.sh` — 28 端点通过 / 3 上游依赖失败（stock-search、chem-spot、mystery-select，基线状态 `/tmp/mrd-smoke-baseline-ref.txt`）。每阶段后必须保持"同样通过、同样失败"。

---

## Phase 0: 准备（已完成）
- [x] 冒烟脚本 `scripts/smoke_test.sh`（31 端点 + JSON 校验）
- [x] 基线快照 `/tmp/mrd-smoke-baseline-ref.txt`
- [x] 审查报告（两份子代理报告为输入）

## Phase 1: 后端正确性修复（高优先级 bug，独立可回归）

### Task 1.1: 统一"6位代码→市场前缀"映射（H2）
**Objective:** 消除 4 套矛盾映射（868/1204/1829/1864 行），8 开头代码不再出现 bj/nq 二义。
**Files:** `server/index.cjs`
**Step 1:** 新增 `toMarketCode(code6)` 单点函数，语义以 src/lib/code.ts 为准（镜像前端）。
**Step 2:** 4 处替换为调用，逐一验证输出。
**Verify:** smoke 全过 + grep 无残留 `689|8→bj|8→NQ` 矛盾分支。
**Commit:** `fix: 统一代码市场前缀映射`

### Task 1.2: 修复 3 处原型污染面（H6）
**Objective:** `__proto__/constructor/prototype` 不能作为对象 key。
**Files:** `server/index.cjs`（195/1494/1758 行附近）
**Step 1:** 定义 `safeKey(k)` 或改用 `Map`。
**Step 2:** 三处分别应用（上游 symbol、厂商 slug、用户参数 name）。
**Verify:** smoke 全过 + 注入 `__proto__` 测试无污染。
**Commit:** `fix: 防止原型污染`

### Task 1.3: 限流头信任加固（H7）
**Objective:** 仅可信代理（CF 网段/环回）采信 cf-connecting-ip，否则用 socket 地址。
**Files:** `server/index.cjs`（2136-2142）
**Step 1:** `clientIp()` 增加来源校验：`req.socket.remoteAddress` 为 CF 网段（173.245.48.0/20 等）或 `::1/127.0.0.1` 才采信头。
**Step 2:** 保留 Tunnel 透传能力（当前部署走 CF，行为不变）。
**Verify:** 外部 smoke 200 + 本地伪造头测试被忽略。
**Commit:** `fix: 限流仅信任可信代理来源IP`

### Task 1.4: 错误分类（H5）
**Objective:** 入参错误返回 4xx 而非 502；非法 JSON body 返回 400。
**Files:** `server/index.cjs`（681/688/814/2236）
**Step 1:** `handleMinute/handleFutureMinute/handleStockBoards/handleFutureDaily` 入参校验抛 `{status:400}`。
**Step 2:** body JSON 解析失败 → 400 invalid json。
**Verify:** 非法参数 smoke 显示 400；正常端点仍 200。
**Commit:** `fix: 入参错误返回4xx而非502`

### Task 1.5: 错误不再伪装成功（H4）
**Objective:** BTC 分钟线失败抛错走负缓存；批量端点错误带错误对象；路由 catch 记 stack。
**Files:** `server/index.cjs`（656/1992/2023/2242）
**Verify:** smoke 全过 + 日志有 stack。
**Commit:** `fix: 错误透明化,不伪装成功`

## Phase 2: 后端公共抽象（零行为变化，纯提取）

### Task 2.1: `lib/format.cjs` — toNum0/changeOf/pctOf/fmtHHMM
**Objective:** `num()` 语义明确（改名 toNum0 + 注释）；涨跌计算 ×5 → `changeOf/pctOf`；HHMM ×3 → `fmtHHMM`。
**Files:** 新建 `server/lib/format.cjs`，改 `server/index.cjs`
**Verify:** smoke 全过 + diff 审查。
**Commit:** `refactor: 提取涨跌/格式化工具`

### Task 2.2: `lib/netutil.cjs` — parseCsvParam/chunked/safeRecord
**Objective:** `.split(",").map(trim).filter(Boolean)` ×5 → `parseCsvParam`；分块 60/50/100 → `chunked`；`Object.create(null)` ×3 + 漏网 1 处 → `safeRecord`。
**Verify:** smoke 全过。
**Commit:** `refactor: 提取 CSV/分块/安全对象工具`

### Task 2.3: `lib/cache.cjs` — cacheSet 工厂 + cachedMany
**Objective:** 8 处手写缓存条目 → `cacheSet`；quotes/stock-flows 手工缓存 → `cached()` 统一（保留行为）。
**Verify:** smoke 全过 + /api/stats 缓存命中率对比。
**Commit:** `refactor: 统一缓存抽象`

### Task 2.4: `lib/http.cjs` — fetchJsonAny/fetchWithRetry
**Objective:** fetch/curl 双通道 ×3 → `fetchJsonAny`；sleep 重试 ×2 → `fetchWithRetry`。
**Verify:** smoke 全过。
**Commit:** `refactor: 提取HTTP双通道与重试`

### Task 2.5: `lib/persist.cjs` — appendDailyHistory
**Objective:** 历史积累+落盘 ×3 → 统一函数。
**Verify:** smoke 全过 + spot-history 文件仍正常写入。
**Commit:** `refactor: 提取每日历史落盘`

## Phase 3: 后端模块拆分（物理拆分）

### Task 3.1: `sources/` 目录 — 按上游拆 7 文件
**Objective:** tencent/sina/eastmoney/crypto/cnbc/sunsirs/ai，把 handleXxx 原样搬走。
**Files:** 新建 `server/sources/*.cjs`；`index.cjs` 改 import。
**Verify:** smoke 全过 + 全端点 diff 对比。
**Commit:** `refactor: 按上游拆分数据源适配器`

### Task 3.2: `routes.cjs` + 瘦身 index.cjs
**Objective:** 声明式路由表 + 入口 ≤80 行；静态服务提 `static.cjs`。
**Verify:** smoke 全过 + 页面 200。
**Commit:** `refactor: 拆分路由表与静态服务`

### Task 3.3: 上帝函数拆分
**Objective:** handleQuotes/handleFinanceMain/handleChainParse/handleOpenRouterUsage/handleFutures 拆成单一职责函数。
**Verify:** smoke 全过。
**Commit:** `refactor: 拆分上帝函数`

## Phase 4: 前端公共抽象（零行为变化）

### Task 4.1: `lib/colors.ts` + `lib/intervals.ts`
**Objective:** 全站色板集中；轮询间隔常量表。
**Files:** 新建 2 文件，改各面板引用。
**Verify:** `npm run build` 过 + 视觉抽查（mrd 面板颜色一致）。
**Commit:** `refactor: 集中色板与轮询间隔`

### Task 4.2: `hooks/useRetryPolling.ts`
**Objective:** retry 样板 ×7 → 统一 hook（含 retry 后 loading 重置修复 G8）。
**Verify:** build 过 + 面板 retry 交互正常。
**Commit:** `refactor: 提取统一轮询hook`

### Task 4.3: 重复逻辑收敛
**Objective:** `num()` 双定义合一；fmtUsd 入 format.ts；sparkData session 兜底 ×5 收敛。
**Verify:** build 过。
**Commit:** `refactor: 收敛重复逻辑`

## Phase 5: 前端组件拆分

### Task 5.1: QuoteRow 拆分（B1/B2）
**Objective:** 502 行 → RowShell + CompactRow/IndexRow/FinanceRow/StockRow；修复 button 套 button。
**Files:** `src/components/dash/QuoteRow.tsx` + 子组件
**Verify:** build 过 + 视觉回归（商品/基差/自选股面板逐屏截图对比）。**不得破坏 168cfb1 验收标准（44px 行高、数据在 spark 右侧、hover 亮边框）。**
**Commit:** `refactor: 拆分QuoteRow变体组件`

### Task 5.2: FinTrendPanel 拆分（C1-C4）
**Objective:** TrendChart 500 行 → ChartFrame + PerfChart/QualityChart/LeverageChart；业务逻辑提纯函数。
**Verify:** build 过 + /fin 页面视觉回归。
**Commit:** `refactor: 拆分FinTrendPanel图表`

### Task 5.3: ChainPanel 拆分（E1-E3）
**Objective:** 五职责 → useChainData + ChainEditorDialog + ChainPanel；修 h-4.5 死样式。
**Verify:** build 过 + 产业链面板交互回归。
**Commit:** `refactor: 拆分ChainPanel`

### Task 5.4: ModelCostPanel 双轮询修复（D2）+ key 修复（D5）
**Objective:** useSharedPolling 合并双份轮询；EventPanel key 改复合 key。
**Verify:** build 过 + 网络面板请求数对比（应减半）。
**Commit:** `fix: 合并重复轮询,修复key`

## Phase 6: 收尾

### Task 6.1: 魔法数字与命名清理
**Objective:** 腾讯字段索引 f[30]-f[43] → 命名映射；86400000/MS_PER_DAY；上限常量；em 前缀/短命名（低优先）。
**Verify:** smoke 全过 + build 过。
**Commit:** `refactor: 魔法数字命名化`

### Task 6.2: 最终全量回归
**Objective:** smoke 对比基线 + build + 全页面视觉抽查 + pm2 部署 + 外部访问。
**Verify:** `/tmp/mrd-smoke-baseline-ref.txt` vs 最终输出：同 28 过 3 上游失败。
**Commit:** 无（如全绿）或修复后补 commit。

---

## 回归纪律
1. **每 Task 后**：`bash scripts/smoke_test.sh` + `npm run build`（前端 Task）+ git commit
2. **基线对比**：失败项必须与基线完全一致（28 过 3 上游依赖失败），新增失败即回归
3. **视觉回归**（前端 Task）：mrd 商品/基差面板行高 44px、数据在 spark 右侧、hover 亮边框——168cfb1 验收标准不可破坏
4. **部署**：每 Phase 末尾 `pm2 restart mrd` + 外部 200 验证
5. **单文件 diff**：纯提取阶段 git diff 应为"移动不修改"

## 风险与开放问题
- **R1**：上游接口随时可能变化导致 smoke 3 个失败项波动——以"同样失败"为判据，不追求全绿
- **R2**：拆分 index.cjs 后需确认无循环依赖（lib → sources → routes 单向）
- **R3**：视觉回归只能靠 DOM 测量（vision 不可用），需浏览器实测
- **Q1**：是否保留零依赖（不引入 express）？默认保留——拆分是纯文件组织，不换框架
