# mrd 托管版 · 本机内测版（2026-08-18）

> 状态：**内测**（非对外、非生产、非销售）。Gavin 2026-08-18 拍板：继续打磨托管版，做内测，暂不对外公布。
> 架构依据：`~/.hermes/opc/mrd-hosting-plan.md` §1（单实例多租户）。

> **红线（庄子 2026-08-18 评估定稿）：本仓库为公开仓库，禁止提交任何收款/订阅/webhook/计费代码与密钥。**
> 拆库预案：托管层 `server/hosting/` 服务端自包含（仅依赖 node builtins），`server/index.cjs` 仅 1 处 try/catch require。
> G1（收款链路）解除时，必须先拆独立私有仓库（服务端 hosting/ + hosting.test.cjs + scripts/gen_invites.js + 未来 billing/ 迁出，
> 部署脚本注入），**先拆库，后写收款代码**。前端登录墙无秘密，留公开仓库不拆。

## 是什么

mrd 托管版「本机内测版」= 开源版 mrd + 托管层（极简账号系统 + 邀请码注册闸门 + 租户隔离），本机单实例运行。

- **单实例多租户**：一个进程服务全部租户，复用 `server/index.cjs` 数据管道与共享内存缓存（上游请求 3~5/s，与租户数无关）
- **极简账号系统**：邀请码+邮箱+密码注册/登录（SQLite `server/data/hosting.db`，scrypt 密码哈希，绝不明文）；不做 OAuth、不做邮箱验证码（内测从简）
- **邀请码注册闸门（0818-q）**：注册必填一次性邀请码；不生成任何邀请码 = 注册完全关闭（守住「8/31 暂不对外公布」红线）；老用户登录不受影响
- **数据面板**：租户登录后可见 mrd 核心行情面板（零 API key 聚合，公开行情共享缓存只读）
- **租户隔离**：公开行情 = 共享缓存只读（无需隔离）；个性化数据（自选股 watchlist）按 `tenant_id` 写入隔离，A 租户数据不泄漏到 B
- **不收款**：无任何 LemonSqueezy webhook/订阅代码（G1 挂起，禁止实现收款链路）
- **不对外**：无公开域名、无公网隧道、无宣传动作；部署仅供内测名单访问（名单与邀请码由庄子 CEO 层拍板分发）

## 启动 / 重启

```bash
bash scripts/start_hosting.sh            # 构建前端 + pm2 启动/重启 mrd-host(:3200)
PORT=3100 bash scripts/start_hosting.sh  # 自定义端口
```

手动方式（等价）：

```bash
# 构建前端（含登录墙逻辑, 运行时探测托管模式）
npm run build
# 启动（HOSTING=1 启用托管层; PORT 默认 3000, 内测用 3200 避开线上 mrd）
PORT=3200 HOSTING=1 pm2 start server/index.cjs --name mrd-host --cwd $(pwd)
```

验证：

```bash
curl http://localhost:3200/api/hosting/config   # {"ok":true,"data":{"enabled":true,...}}
curl http://localhost:3200/api/health           # {"ok":true,"data":{"status":"up",...}}
```

## 邀请码机制（0818-q）

邀请码 = 「注册开关」的落地形式：**不生成任何邀请码 = 注册完全关闭**（register 一律拒绝，守住「8/31 暂不对外公布」红线）。每个邀请码限注册 **1 个账号**（一次性），成功注册后自动标记已用，不可复用；已注册用户登录不受影响（邀请码只拦注册，不拦登录）。

### 生成（管理员）

```bash
node scripts/gen_invites.js <N>   # 生成 N 个邀请码, 每行一个输出到 stdout
node scripts/gen_invites.js 10    # 示例: 生成 10 个
```

- 码为 **12 位**随机大写字母+数字，字符集剔除全部易混淆字符（`0/O/1/I/L`），`crypto.randomInt` 无模偏差生成
- 落库 `invite_codes` 表（`revoked=0`），仅供管理员 stdout 查看 —— **邀请码绝不进入任何 API 响应/前端 bundle**（只进 register 请求体）
- 输入容错：前端/服务端统一把邀请码转大写后校验（手输小写也能用）

### 撤销

```bash
# sqlite3 直接执行(库文件 server/data/hosting.db):
UPDATE invite_codes SET revoked = 1 WHERE code = '<CODE>';
```

撤销后该码不可再用于注册；已用该码注册的用户不受影响。

### 内测注册流程

1. 庄子 CEO 层拍板内测名单 → 管理员 `node scripts/gen_invites.js 1` 生成码 → 逐个私发名单成员
2. 成员打开托管版实例 → 登录墙 → 切「注册」→ 填邮箱 + 密码 + 12 位邀请码 → 注册即登录进看板
3. 无码/假码 → 400「请填写邀请码/邀请码无效」；已用/已撤销 → 403；**同一 IP 每分钟失败超 10 次 → 429「尝试过于频繁」**（防公网暴力破解）

## 账号 API（/api/hosting/*）

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/hosting/config` | GET | 托管模式标志（前端探测用；开源版 404） |
| `/api/hosting/register` | POST | 注册 `{email, password, invite_code}` → `{token, tenant}`（注册即登录；邀请码必填且一次性） |
| `/api/hosting/login` | POST | 登录 `{email, password}` → `{token, tenant}`（无需邀请码） |
| `/api/hosting/logout` | POST | 登出（需 Bearer token，body 传 `{}`） |
| `/api/hosting/me` | GET | 当前用户信息（需 Bearer token） |
| `/api/hosting/watchlist` | GET/POST | 自选股读写，按租户隔离（需 Bearer token；POST 覆盖写入 `{codes:[...]}`） |

- 会话：Bearer token（`Authorization: Bearer <token>`），随机 32 字节，库中仅存 sha256；30 天过期，每日清理
- 密码规则：≥8 位；邮箱格式校验；重复注册 409；密码错误 401
- 密码哈希：`crypto.scrypt`（N=16384,r=8,p=1,64B），格式 `scrypt$N$r$p$salt$hash`

## 前端行为

- 运行时探测 `/api/hosting/config`：
  - **托管模式**（HOSTING=1，端点返回 enabled:true）：未登录 → 登录/注册页；登录 → 看板
  - **开源模式**（未启用，端点 404）：直接渲染看板，行为与以往完全一致（零回归）
- 自选股面板：托管模式（登录态）走服务端 `/api/hosting/watchlist`（按租户隔离）；开源模式保持 localStorage

## 测试

```bash
npm test                              # vitest(src/) + node --test(server/*.test.cjs)
node --test server/hosting.test.cjs   # 托管层单测(注册/登录/哈希/隔离/邀请码闸门/限流/401/持久化, 18 例)
bash scripts/smoke_test.sh /tmp/out.txt http://localhost:3200   # 托管实例全端点冒烟
```

基线：npm test 全绿；smoke 32 过 / 3 上游失败（stock-search/chem-spot/mystery-select 为已知上游失败基线）。

## 数据结构（SQLite，`PRAGMA user_version = 2`）

```sql
users:        id, tenant_id(UNIQUE), email(UNIQUE), pass_hash, created_at
sessions:     token_hash(PK), tenant_id, created_at, expires_at
prefs:        tenant_id(PK), watchlist(JSON), updated_at
invite_codes: code(PK), created_at(epoch ms), used_by(→users.id, NULL=未用), used_at(NULL=未用), revoked(0/1)
```

- `invite_codes`：注册闸门（0818-q）。`used_by`+`used_at` 在注册成功时于同一事务内原子写入（一次性）；`revoked=1` 撤销后不可注册
- 库文件在 `server/data/hosting.db`（随 `server/data/` gitignored，不入库）；旧库（v1）启动时自动迁移建表，历史用户/会话不受影响

## 上线前待办（非本卡范围）

- 内测名单（庄子拍板）→ 按名单放行访问
- G1 收款（LS 注册）拍板后，才可实现 webhook/订阅链路
- G2 服务器拍板后，才可上云部署（当前本机零成本）
