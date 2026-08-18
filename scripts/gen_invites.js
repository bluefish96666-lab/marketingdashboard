// mrd 托管版 · 管理员生成邀请码 CLI（0818-q）
// 用法: node scripts/gen_invites.js <N>     # 生成 N 个一次性邀请码, 每行一个输出到 stdout
// 示例: node scripts/gen_invites.js 10
//
// 语义:
// - 邀请码 = 「注册开关」落地形式: 不生成任何邀请码 = 注册完全关闭(register 无有效码一律拒绝)
// - 每个邀请码限注册 1 个账号, 注册成功后自动标记已用(一次性), 不可复用
// - 撤销: sqlite3 执行
//     UPDATE invite_codes SET revoked = 1 WHERE code = '<CODE>';
//   已注册用户不受撤销影响(撤销只挡后续注册)
// - 码为 12 位随机大写字母+数字, 剔除全部易混淆字符(0/O/1/I/L), 由 crypto.randomInt 生成(无模偏差)
//
// 红线: 本工具输出到 stdout 仅管理员可见; 邀请码绝不进入任何 API 响应/前端 bundle。
// 注: 本仓库 package.json 为 "type": "module", 故用动态 import 加载 CJS 的 db.cjs。
"use strict";
const mod = await import("../server/hosting/db.cjs");
const { openHostingDb, defaultDbPath, createInviteCodes } = mod.default || mod;

const n = Number(process.argv[2]);
if (!Number.isInteger(n) || n < 1 || n > 10000) {
  console.error("用法: node scripts/gen_invites.js <N>");
  console.error("      N = 生成邀请码数量(整数, 1-10000); 每行一个输出到 stdout");
  process.exit(1);
}

const db = openHostingDb(defaultDbPath());
let codes;
try {
  codes = createInviteCodes(db, n);
} finally {
  db.close();
}
for (const c of codes) console.log(c);
