import { callHost } from './host-call.mjs';
// Fixed native-memory bridge. Whole-list writes are guarded and read back.
export const normalizePath = value => {
  if (typeof value !== 'string') return '';
  const p = value.replaceAll('\\', '/').replace(/\/+$/, '');
  return /^[a-z]:\//i.test(p) ? p.toLowerCase() : p;
};
const fail = code => Object.assign(new Error(code), { code });
export const normalizeText = value => String(value).normalize('NFKC').replace(/\r\n/g, '\n').trim();
export const entryStamp = entries => JSON.stringify(entries.map(({ id, title, content }) => ({ id, title, content })));

export function snapshot(response) {
  const memory = response?.memory;
  if (!memory || typeof memory.content !== 'string') throw fail('INVALID_MEMORY');
  if ((memory.entries == null || (Array.isArray(memory.entries) && !memory.entries.length)) && memory.content.trim()) throw fail('UNSTRUCTURED_MEMORY');
  const entries = memory.entries ?? [];
  if (!Array.isArray(entries) || entries.length > 2000 || entries.some(e => !e ||
    Object.keys(e).some(k => !['id', 'title', 'content'].includes(k)) ||
    ['id', 'title', 'content'].some(k => typeof e[k] !== 'string' || e[k] !== e[k].trim()) || !e.id || !e.content) ||
    new Set(entries.map(e => e.id)).size !== entries.length) throw fail('NONCANONICAL_MEMORY');
  // Never discard legacy free text alongside structured entries.
  return { entries: entries.map(({ id, title, content }) => ({ id, title, content })),
    stamp: JSON.stringify({ entries: JSON.parse(entryStamp(entries)), content: memory.content, updatedAt: memory.updatedAt ?? null }) };
}

export function filterNovel(entries, candidates) {
  const known = [...entries];
  const accepted = [];
  const skipped = [];
  for (const item of candidates) {
    if (known.some(e => e.id === item.id)) {
      const same = known.find(e => e.id === item.id);
      if (same.content !== item.content || same.title !== item.title) throw fail('ENTRY_ID_CONFLICT');
      skipped.push({ title: item.title, reason: 'duplicate' }); continue;
    }
    if (known.some(e => normalizeText(e.content) === normalizeText(item.content))) {
      skipped.push({ title: item.title, reason: 'duplicate' }); continue;
    }
    // A same-title correction must not silently become a second conflicting card.
    if (known.some(e => normalizeText(e.title).toLowerCase() === normalizeText(item.title).toLowerCase())) {
      skipped.push({ title: item.title, reason: 'existing_topic' }); continue;
    }
    known.push(item); accepted.push(item);
  }
  return { accepted, skipped };
}

export async function runNativeJob(bridge, job, options = {}) {
  let attempted = false;
  const alive = () => {
    if (options.isStopped?.() || Date.now() >= job.expiresAt) throw fail('EXPIRED_OR_UNLOADED');
  };
  const call = (key, input) => callHost(bridge, key, input, { guard: alive });
  const owner = async () => {
    const response = await call('sessionGet', { id: job.sessionId, messageLimit: 1, contentLimit: 1 });
    const session = response?.session;
    if (!session || session.id !== job.sessionId || !normalizePath(session.projectPath) ||
      session.source === 'remote' || session.remoteHostKey || session.remoteWorkspace) throw fail('SESSION_UNAVAILABLE');
    return { sessionId: session.id, projectPath: normalizePath(session.projectPath), source: 'desktop' };
  };
  const resolve = async () => {
    const session = await owner();
    if (normalizePath(session.projectPath) !== normalizePath(job.projectPath)) throw fail('SESSION_MOVED');
    const list = await call('projectGroupList');
    if (!Array.isArray(list?.groups)) throw fail('INVALID_PROJECT_GROUPS');
    const groups = list.groups.filter(g => Array.isArray(g.roots) && g.roots.some(r => normalizePath(r.path) === normalizePath(session.projectPath)));
    if (groups.length !== 1) throw fail('AMBIGUOUS_PROJECT');
    const group = groups[0];
    if (group.legacy !== true && (typeof group.id !== 'string' || !group.id)) throw fail('INVALID_PROJECT_GROUP');
    return { projectPath: normalizePath(session.projectPath), kind: group.legacy === true ? 'legacy' : 'group',
      identity: group.legacy === true ? normalizePath(session.projectPath) : group.id,
      name: (typeof group.name === 'string' ? group.name.trim() : '') || session.projectPath.split('/').filter(Boolean).at(-1) || '项目' };
  };
  const same = (a, b) => a && b && a.projectPath === b.projectPath && a.kind === b.kind && a.identity === b.identity;
  try {
    if (!job || !['session', 'read', 'append', 'update', 'delete', 'replace'].includes(job.operation) || typeof job.sessionId !== 'string' || !job.sessionId ||
      (job.operation !== 'session' && !normalizePath(job.projectPath))) throw fail('INVALID_JOB');
    if (job.operation === 'session') return { status: 'session', session: await owner() };
    const binding = await resolve();
    if (job.binding && !same(binding, job.binding)) throw fail('PROJECT_MEMBERSHIP_CHANGED');
    const input = binding.kind === 'group' ? { groupId: binding.identity } : { projectPath: job.projectPath };
    const get = () => call(binding.kind === 'group' ? 'projectGroupMemoryGet' : 'projectMemoryGet', input).then(snapshot);
    const initial = await get();
    if (job.operation === 'read') return { status: 'read', binding, ...initial };
    if (initial.stamp !== job.stamp) throw fail('STALE_BASIS');
    let expected, accepted = [], skipped = [], updated = [], deleted = [];
    if (job.operation === 'append') {
      if (!Array.isArray(job.items) || job.items.length > 3 || job.items.some(e => !e ||
        !/^knowstack-[0-9a-f]{32}$/.test(e.id) || typeof e.title !== 'string' || !e.title.trim() || e.title.length > 24 ||
        typeof e.content !== 'string' || !e.content.trim() || e.content.length > 300)) throw fail('INVALID_ITEMS');
      ({ accepted, skipped } = filterNovel(initial.entries, job.items));
      if (!accepted.length) return { status: 'skipped', saved: [], skipped };
      expected = [...initial.entries, ...accepted];
    } else if (job.operation === 'replace') {
      // Explicit user editor submission, never exposed as an Agent tool.
      expected = snapshot({ memory: { entries: job.items, content: '' } }).entries;
    } else {
      if (!Array.isArray(job.items) || !job.items.length || job.items.length > 3 || new Set(job.items.map(e => e.memoryId)).size !== job.items.length) throw fail('INVALID_ITEMS');
      const targets = new Map(job.items.map(e => [e.memoryId, e]));
      if (job.items.some(e => !initial.entries.some(a => a.id === e.memoryId))) throw fail('ENTRY_NOT_FOUND');
      expected = initial.entries.flatMap(entry => {
        const change = targets.get(entry.id); if (!change) return [entry];
        if (job.operation === 'delete') { deleted.push(entry); return []; }
        if (typeof change.title !== 'string' || !change.title.trim() || change.title.length > 24 || /[\r\n]/.test(change.title) ||
            typeof change.content !== 'string' || !change.content.trim() || change.content.length > 300) throw fail('INVALID_ITEMS');
        const next = { id: entry.id, title: change.title.trim(), content: change.content.trim() };
        updated.push(next); return [next];
      });
    }
    // Re-resolve the exact session, not the current UI project, immediately before saving.
    if (!same(await resolve(), binding)) throw fail('PROJECT_MEMBERSHIP_CHANGED');
    const current = await get();
    if (current.stamp !== initial.stamp) throw fail('CONCURRENT_CHANGE');
    if (job.operation === 'delete' && options.authorize && !(await options.authorize(job))) throw fail('AUTO_DELETE_DISABLED');
    alive();
    attempted = true;
    await call(binding.kind === 'group' ? 'projectGroupMemorySave' : 'projectMemorySave', { ...input, entries: expected });
    const after = await get();
    if (!same(await resolve(), binding)) throw fail('SESSION_MOVED_AFTER_WRITE');
    if (expected.some(e => !after.entries.some(a => a.id === e.id && a.title === e.title && a.content === e.content)) ||
        deleted.some(e => after.entries.some(a => a.id === e.id)) ||
        (job.operation === 'replace' && entryStamp(expected) !== entryStamp(after.entries))) throw fail('READ_BACK_MISMATCH');
    if (job.operation === 'update') return { status: 'updated', updated, saved: [], skipped: [] };
    if (job.operation === 'delete') return { status: 'deleted', deleted, saved: [], skipped: [] };
    if (job.operation === 'replace') return { status: 'replaced', entries: after.entries, stamp: after.stamp, saved: [], skipped: [] };
    return { status: 'saved', saved: accepted, skipped };
  } catch (error) {
    return { status: attempted ? 'unverified' : 'failed', saved: [], skipped: [],
      errorCode: /^[A-Z_]{1,64}$/.test(error?.code) ? error.code : 'NATIVE_OPERATION_FAILED',
      ...(error?.step ? { errorStep: error.step } : {}) };
  }
}
