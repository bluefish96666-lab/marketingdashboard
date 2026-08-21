/**
 * 人在 loop 工作台 · 纯逻辑层（0821-轨A-8 t_16098289）
 * 设计基线: ~/.hermes/opc/human-in-loop-workbench.md
 *
 * 职责: 与 SQLite/CLI 无关的纯函数 —— token 校验 / 反馈载荷校验 / 动作→CLI 命令规划。
 * 单测: server/workbench.test.cjs。index.cjs 只做薄接线（db 读取 + spawn hermes CLI）。
 */
const crypto = require("crypto");

// MVP 4 动作（设计文档 §4 拍板）: approve=批准, reject=驳回, comment=补充意见, done=标记完成
const FB_ACTIONS = ["approve", "reject", "comment", "done"];

// 安全边界（设计文档 §4）: 只允许操作 assignee=gavin 或 block_kind=needs_input 的卡
function taskOperable(task) {
  return !!task && (task.assignee === "gavin" || task.block_kind === "needs_input");
}

/** 常数时间 token 比较（防时序侧信道; 长度不同直接 false） */
function tokenOk(candidate, expected) {
  if (!candidate || !expected) return false;
  const a = Buffer.from(String(candidate));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

/**
 * 校验反馈载荷: {token?, task_id, action, text}
 * 返回 {ok:true, value:{taskId, action, text}} 或 {ok:false, status, error}
 */
function validateFeedback(body) {
  const b = body && typeof body === "object" ? body : {};
  const taskId = String(b.task_id || "").trim();
  const action = String(b.action || "").trim();
  const text = String(b.text || "").trim().slice(0, 4000);
  if (!taskId || !/^t_[A-Za-z0-9_-]+$/.test(taskId)) {
    return { ok: false, status: 400, error: "task_id 无效" };
  }
  if (!FB_ACTIONS.includes(action)) {
    return { ok: false, status: 400, error: "action 无效（approve|reject|comment|done）" };
  }
  if ((action === "comment" || action === "reject") && !text) {
    return { ok: false, status: 400, error: "该动作需要填写内容" };
  }
  return { ok: true, value: { taskId, action, text } };
}

/**
 * 动作 → hermes kanban CLI 命令序列（双留痕: comment + event; 全部走 CLI, 不裸写 SQLite）。
 * task = { status, assignee, block_kind, block_recurrences } —— 来自只读查询,
 * 用于 reject 的"非 blocked 需回堵"分支（block_recurrences 决定是否回堵, 见 reject 分支注释）。
 * 返回二维数组, 每项为 hermes kanban 子命令 args（不含 kanban --board 前缀）。
 */
function buildPlan(action, task, text) {
  const commentArgs = (body) => ["comment", task.id, body, "--author", "gavin"];
  const plan = [];
  if (action === "approve") {
    // 批准: 评论(author=gavin) + unblock（父卡未 done 时内核自动进 todo 而非 ready）
    plan.push(commentArgs(text || "批准，按方案继续。"));
    plan.push(["unblock", task.id]);
  } else if (action === "done") {
    // 标记完成: 评论 + complete（Gavin 直接收尾）
    plan.push(commentArgs(text || "Gavin 已标记完成。"));
    plan.push(["complete", task.id]);
  } else if (action === "reject") {
    // 驳回 = 「保持原状态 + 评论」: 评论(说明理由) + 保持 blocked。
    // 非 blocked 时回堵 needs_input 防驳回后卡继续跑——但若该卡已有 needs_input 历史
    // (block_recurrences>=1, 如反复 approve→reject), 回堵会触发内核 block_loop_detected
    // → 卡进 triage → auto-decomposer 改写真实卡标题/正文(数据损坏)。防误伤(0821-b t_1cc8fecd):
    // 此时不再回堵, 仅评论并说明, 宁可卡保持原状态。
    const recurrences = task.block_recurrences ?? 0;
    const reblockable = task.status !== "blocked" && recurrences < 1;
    let commentBody = text;
    if (task.status !== "blocked" && recurrences >= 1) {
      commentBody = `${text}\n\n（已驳回，卡保持原状态；如需阻止执行请联系庄子）`;
    }
    plan.push(commentArgs(commentBody));
    if (reblockable) {
      plan.push(["block", task.id, "--kind", "needs_input"]);
    }
  } else {
    // 补充意见: 仅评论, 卡保持原状态
    plan.push(commentArgs(text));
  }
  return plan;
}

module.exports = { FB_ACTIONS, taskOperable, tokenOk, validateFeedback, buildPlan };
