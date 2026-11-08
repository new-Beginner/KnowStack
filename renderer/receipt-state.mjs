export function unwrapResult(value, depth = 0) {
  if (depth > 3 || !value || typeof value !== 'object') return null;
  if (typeof value.status === 'string') return value;
  if (value.details) { const result = unwrapResult(value.details, depth + 1); if (result) return result; }
  for (const block of value.content ?? []) {
    if (block?.type === 'text') { try { const result = unwrapResult(JSON.parse(block.text), depth + 1); if (result) return result; } catch {} }
  }
  return null;
}
export const STATUS_LABELS = {
  read: '已读取原生记忆', saved: '已保存 · 回读验证成功', awaiting_review: '待确认 · 尚未保存',
  updated: '已修改 · 回读验证成功', deleted: '已删除 · 回读验证成功',
  saving: '正在保存，请勿重载', skipped: '已跳过重复内容', rejected: '未保存 · 已拒绝',
  failed: '未保存', unverified: '结果待确认 · 请检查原生记忆，不要重试', expired: '已过期 · 未保存',
};
