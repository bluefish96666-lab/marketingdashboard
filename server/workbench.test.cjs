// 人在 loop 工作台 · 纯逻辑层单测（0821-轨A-8 t_16098289）
// 覆盖: token 常数时间比较 / 载荷校验 / 动作→CLI 计划 / 安全边界。node --test 运行。
const { test } = require("node:test");
const assert = require("node:assert");
const { FB_ACTIONS, taskOperable, tokenOk, validateFeedback, buildPlan } = require("./lib/workbench.cjs");

const TASK = { id: "t_abc123", status: "blocked", assignee: "gavin", block_kind: "needs_input" };

test("tokenOk: 正确 token 通过", () => {
  assert.ok(tokenOk("secret-abc", "secret-abc"));
});
test("tokenOk: 错误 token 拒绝", () => {
  assert.ok(!tokenOk("wrong", "secret-abc"));
});
test("tokenOk: 空值/长度不同拒绝", () => {
  assert.ok(!tokenOk("", "secret-abc"));
  assert.ok(!tokenOk("abc", "abcd"));
  assert.ok(!tokenOk("secret-abc", null));
  assert.ok(!tokenOk(null, "secret-abc"));
});

test("validateFeedback: 合法载荷", () => {
  const r = validateFeedback({ token: "x", task_id: "t_abc123", action: "approve", text: "同意" });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.value, { taskId: "t_abc123", action: "approve", text: "同意" });
});
test("validateFeedback: task_id 缺失/非法", () => {
  assert.strictEqual(validateFeedback({ action: "approve" }).ok, false);
  assert.strictEqual(validateFeedback({ task_id: "abc", action: "approve" }).ok, false);
  assert.strictEqual(validateFeedback({ task_id: "t_a<b", action: "approve" }).ok, false);
  assert.strictEqual(validateFeedback({ task_id: "t_abc;DROP", action: "approve" }).ok, false);
});
test("validateFeedback: action 白名单", () => {
  assert.strictEqual(validateFeedback({ task_id: "t_abc", action: "hack" }).ok, false);
  assert.strictEqual(validateFeedback({ task_id: "t_abc", action: "approve" }).ok, true);
  assert.deepStrictEqual(FB_ACTIONS, ["approve", "reject", "comment", "done"]);
});
test("validateFeedback: comment/reject 必须有 text", () => {
  assert.strictEqual(validateFeedback({ task_id: "t_abc", action: "comment" }).ok, false);
  assert.strictEqual(validateFeedback({ task_id: "t_abc", action: "reject" }).ok, false);
  assert.strictEqual(validateFeedback({ task_id: "t_abc", action: "done" }).ok, true);
  assert.strictEqual(validateFeedback({ task_id: "t_abc", action: "approve" }).ok, true);
});
test("validateFeedback: text 截断 4000 字符", () => {
  const r = validateFeedback({ task_id: "t_abc", action: "comment", text: "x".repeat(5000) });
  assert.strictEqual(r.value.text.length, 4000);
});

test("taskOperable: 只允许 gavin 或 needs_input", () => {
  assert.ok(taskOperable({ assignee: "gavin" }));
  assert.ok(taskOperable({ assignee: "make", block_kind: "needs_input" }));
  assert.ok(!taskOperable({ assignee: "make", block_kind: null }));
  assert.ok(!taskOperable(null));
});

test("buildPlan: approve = 评论(gavin) + unblock", () => {
  const p = buildPlan("approve", TASK, "同意，继续");
  assert.deepStrictEqual(p, [
    ["comment", "t_abc123", "同意，继续", "--author", "gavin"],
    ["unblock", "t_abc123"],
  ]);
});
test("buildPlan: done = 评论(gavin) + complete", () => {
  const p = buildPlan("done", TASK, "");
  assert.deepStrictEqual(p, [
    ["comment", "t_abc123", "Gavin 已标记完成。", "--author", "gavin"],
    ["complete", "t_abc123"],
  ]);
});
test("buildPlan: reject 且已 blocked = 仅评论（保持 blocked）", () => {
  const p = buildPlan("reject", TASK, "方案不行，重议");
  assert.deepStrictEqual(p, [["comment", "t_abc123", "方案不行，重议", "--author", "gavin"]]);
});
test("buildPlan: reject 且非 blocked = 评论 + 回堵 needs_input", () => {
  const running = { id: "t_abc123", status: "running", assignee: "gavin", block_kind: null };
  const p = buildPlan("reject", running, "先停一下");
  assert.deepStrictEqual(p, [
    ["comment", "t_abc123", "先停一下", "--author", "gavin"],
    ["block", "t_abc123", "--kind", "needs_input"],
  ]);
});
test("buildPlan: comment = 仅评论", () => {
  const p = buildPlan("comment", TASK, "补充一点");
  assert.deepStrictEqual(p, [["comment", "t_abc123", "补充一点", "--author", "gavin"]]);
});
