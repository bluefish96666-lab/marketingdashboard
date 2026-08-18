# mrd 托管版 · 本机内测版（2026-08-18）

> 状态：**内测**（非对外、非生产、非销售）。Gavin 2026-08-18 拍板：继续打磨托管版，做内测，暂不对外公布。
> 架构依据：`~/.hermes/opc/mrd-hosting-plan.md` §1（单实例多租户）。

## 是什么

mrd 托管版「本机内测版」= 开源版 mrd + 托管层（极简账号系统 + 租户隔离），本机单实例运行。

- **单实例多租户**：一个进程服务全部租户，复用 `server/index.cjs` 数据管道与共享内存缓存（上游请求 3~5/s，与租户数无关）
- **极简账号系统**：邮箱+密码注册/登录（SQLite `server/data/hosting.db`，scrypt 密码哈希，绝不明文）；不做 OAuth、不做邮箱验证码（内测从简）
- **数据面板**：租户登录后可见 mrd 核心行情面板（零 API key 聚合，公开行情共享缓存只读）
- **租户隔离**：公开行情 = 共享缓存只读（无需隔离）；个性化数据（自选股 watchlist）按 `tenant_id` 写入隔离，A 租户数据不泄漏到 B
- **不收款**：无任何 LemonSqueezy webhook/订阅代码（G1 挂起，禁止实现收款链路）
- **不对外**：无公开域名、无公网隧道、无宣传动作；部署仅供内测名单访问（名单由庄子 CEO 拍板）

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

## 账号 API（/api/hosting/*）

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/hosting/config` | GET | 托管模式标志（前端探测用；开源版 404） |
| `/api/hosting/register` | POST | 注册 `{email, password}` → `{token, tenant}`（注册即登录） |
| `/api/hosting/login` | POST | 登录 → `{token, tenant}` |
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
node --test server/hosting.test.cjs   # 托管层单测(注册/登录/哈希/隔离/401/持久化, 11 例)
bash scripts/smoke_test.sh /tmp/out.txt http://localhost:3200   # 托管实例全端点冒烟
```

基线：45/45 全绿；smoke 32 过 / 3 上游失败（stock-search/chem-spot/mystery-select 为已知上游失败基线）。

## 数据结构（SQLite，`PRAGMA user_version = 1`）

```sql
users:    id, tenant_id(UNIQUE), email(UNIQUE), pass_hash, created_at
sessions: token_hash(PK), tenant_id, created_at, expires_at
prefs:    tenant_id(PK), watchlist(JSON), updated_at
```

库文件在 `server/data/hosting.db`（随 `server/data/` gitignored，不入库）。

## 上线前待办（非本卡范围）

- 内测名单（庄子拍板）→ 按名单放行访问
- G1 收款（LS 注册）拍板后，才可实现 webhook/订阅链路
- G2 服务器拍板后，才可上云部署（当前本机零成本）
