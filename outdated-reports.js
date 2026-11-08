'use strict';
const crypto = require('node:crypto');
const { pathKey } = require('./project-settings.js');
const copy = value => JSON.parse(JSON.stringify(value));
const sameEntry = (a, b) => a && b && a.id === b.id && a.title === b.title && a.content === b.content;
const sameBinding = (a, b) => a && b && pathKey(a.projectPath) === pathKey(b.projectPath) && a.kind === b.kind && a.identity === b.identity;

function validateReports(args) {
  if (!args || Object.keys(args).some(k => !['readToken', 'items'].includes(k)) ||
      typeof args.readToken !== 'string' || !args.readToken || !Array.isArray(args.items) || args.items.length < 1 || args.items.length > 3) throw new Error('Use readToken and 1–3 evidenced outdated-memory reports');
  const ids = new Set();
  return args.items.map(item => {
    if (!item || Object.keys(item).some(k => !['memoryId', 'reason', 'evidence'].includes(k)) ||
        ['memoryId', 'reason', 'evidence'].some(k => typeof item[k] !== 'string' || !item[k].trim())) throw new Error('Only memoryId, reason and concrete evidence are accepted');
    const value = Object.fromEntries(Object.entries(item).map(([k, v]) => [k, v.trim()]));
    if (value.memoryId.length > 200 || value.reason.length > 300 || value.evidence.length > 600 || ids.has(value.memoryId)) throw new Error('Report fields too long or duplicate memory IDs');
    if (/-----BEGIN .*PRIVATE KEY-----|\bsk-[a-zA-Z0-9]{20,}|\b(?:api[_-]?key|password|token)\s*[:=]\s*["']?[^\s"']{12,}/i.test(value.reason + '\n' + value.evidence)) throw new Error('Potential credential: do not include secrets');
    ids.add(value.memoryId); return value;
  });
}

// Transient reminders only. This module has no native-memory save/delete capability.
function createOutdatedReports({ session, readNative, getBasis, now = Date.now }) {
  const records = new Map(); const seen = new Set();
  let stopped = false;
  const view = record => copy({ status: record.status, reportId: record.id, sessionId: record.owner.sessionId,
    items: record.items, errorCode: record.errorCode, saved: [],
    finalReminder: `⚠️ 知栈：${record.items.length} 条疑似过时记忆待检查，是否删除由你决定。\n${record.items.map(item => `- ${JSON.stringify(item.title || '未命名记忆')}`).join('\n')}\n<!-- knowstack-outdated:${record.id} -->`,
    notice: 'Reminder only. Native memory has not been modified; deletion is a manual user action. Append finalReminder verbatim at the end of the final answer (not in a code fence) so the user sees the reminder outside tool logs.' });
  const invalidate = (record, errorCode) => {
    record.status = 'expired'; record.errorCode = errorCode;
    for (const item of record.items) if (item.state === 'pending') item.state = 'unavailable';
    return view(record);
  };
  const alive = () => { if (stopped) throw new Error('Plugin unloaded'); };
  async function report(args, context) {
    alive(); const items = validateReports(args);
    const owner = await session(context); const basis = getBasis(args.readToken);
    if (!basis || basis.expiresAt <= now() || basis.sessionId !== owner.sessionId || basis.turnId !== owner.turnId ||
        pathKey(basis.projectPath) !== pathKey(owner.projectPath)) throw new Error('Read current native memory in this session and turn before reporting');
    const candidates = items.map(item => {
      const entry = basis.entries.find(e => e.id === item.memoryId);
      if (!entry) throw new Error('Unknown memory ID in read basis');
      return { memoryId: entry.id, title: entry.title, content: entry.content, reason: item.reason, evidence: item.evidence, state: 'pending' };
    });
    const current = await readNative(owner, { binding: basis.binding }); alive();
    if (current.status !== 'read') return { status: 'failed', saved: [], items: [], errorCode: current.errorCode || 'READ_FAILED' };
    if (!sameBinding(current.binding, basis.binding) || current.stamp !== basis.stamp) return { status: 'failed', saved: [], items: [], errorCode: 'STALE_BASIS' };
    const verifiedOwner = await session(owner); alive();
    if (pathKey(verifiedOwner.projectPath) !== pathKey(owner.projectPath)) return { status: 'failed', saved: [], items: [], errorCode: 'SESSION_MOVED' };
    const keyOf = item => JSON.stringify([owner.sessionId, current.binding, item.memoryId, item.title, item.content]);
    const accepted = candidates.filter(item => !seen.has(keyOf(item)));
    if (!accepted.length) return { status: 'skipped', sessionId: owner.sessionId, items: [], saved: [], reason: 'already_reported' };
    // Keep deduplication for this plugin lifetime without unbounded retention.
    if (records.size >= 200 || seen.size + accepted.length > 600) throw new Error('Reminder limit reached for this plugin load');
    const record = { id: crypto.randomUUID(), owner, binding: copy(current.binding), items: accepted, status: 'reported', expiresAt: now() + 900000 };
    accepted.forEach(item => seen.add(keyOf(item))); records.set(record.id, record);
    return view(record);
  }
  async function review(args) {
    alive();
    const record = records.get(args?.reportId);
    if (!record || args.sessionId !== record.owner.sessionId) throw new Error('Reminder belongs to another session or has expired');
    if (!['get', 'open', 'dismiss'].includes(args.action)) throw new Error('Unknown reminder action; deletion is not supported');
    if (record.expiresAt <= now()) return invalidate(record, 'REMINDER_EXPIRED');
    if (record.status === 'expired') return view(record);
    const item = record.items.find(i => i.memoryId === args.memoryId);
    if (args.action !== 'get' && !item) throw new Error('Unknown reminder memory ID');
    if (args.action === 'dismiss') {
      if (item.state === 'pending') item.state = 'dismissed';
      return view(record);
    }
    const owner = await session(record.owner); alive();
    if (pathKey(owner.projectPath) !== pathKey(record.owner.projectPath)) return invalidate(record, 'SESSION_MOVED');
    const current = await readNative(owner, { binding: record.binding }); alive();
    if (current.status !== 'read') return { ...view(record), errorCode: current.errorCode || 'READ_FAILED' };
    if (!sameBinding(current.binding, record.binding)) return invalidate(record, 'PROJECT_MEMBERSHIP_CHANGED');
    const afterOwner = await session(record.owner); alive();
    if (pathKey(afterOwner.projectPath) !== pathKey(record.owner.projectPath)) return invalidate(record, 'SESSION_MOVED');
    for (const candidate of record.items) {
      if (candidate.state !== 'pending') continue;
      const entry = current.entries.find(e => e.id === candidate.memoryId);
      if (!entry) candidate.state = 'missing';
      else if (!sameEntry(entry, { id: candidate.memoryId, ...candidate })) candidate.state = 'changed';
    }
    const result = view(record);
    if (args.action === 'open' && item.state === 'pending') result.target = {
      sessionId: owner.sessionId, projectPath: owner.projectPath,
      projectKey: `${record.binding.kind === 'group' ? 'group' : 'legacy'}:${record.binding.identity}`,
      memory: { id: item.memoryId, title: item.title, content: item.content },
    };
    return result;
  }
  return { report, review, stop() { stopped = true; records.clear(); seen.clear(); } };
}
module.exports = { createOutdatedReports, validateReports };
