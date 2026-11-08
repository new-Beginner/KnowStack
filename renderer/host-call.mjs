// Fixed, trusted Renderer channels only. Never expose private host messages.
const CODES = new Set(['TIMEOUT', 'IPC_TIMEOUT', 'BUSY', 'UNAVAILABLE', 'NOT_FOUND', 'INVALID_ARGUMENT', 'INVALID_PARAMS', 'PERMISSION_DENIED', 'UNSUPPORTED', 'INTERNAL', 'INTERNAL_ERROR', 'CANCELLED', 'ABORTED', 'NOT_READY', 'RATE_LIMITED']);
export const HOST_CODES = new Set([...CODES].map(code => `HOST_${code}`));
const TRANSIENT = new Set(['TIMEOUT', 'IPC_TIMEOUT', 'BUSY', 'UNAVAILABLE']);
export function hostError(error, step) {
  const raw = error?.code ?? error?.errorCode;
  const code = CODES.has(raw) ? `HOST_${raw}` : 'HOST_CALL_FAILED';
  return Object.assign(new Error(code), { code, step, transient: TRANSIENT.has(raw) });
}
export async function callHost(bridge, key, input, { guard = () => {}, delay = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  guard();
  const channel = bridge?.channels?.invoke?.[key];
  if (typeof channel !== 'string' || typeof bridge?.invoke !== 'function') throw Object.assign(new Error('BRIDGE_UNAVAILABLE'), { code: 'BRIDGE_UNAVAILABLE', step: key });
  const readOnly = ['sessionGet', 'projectGroupList', 'projectGroupMemoryGet', 'projectMemoryGet'].includes(key);
  for (let attempt = 0; ; attempt++) {
    guard();
    let value;
    try {
      const response = await bridge.invoke(channel, input);
      guard();
      if (response?.ok !== true || !Object.hasOwn(response, 'data')) throw hostError(response?.error, key);
      value = response.data;
    } catch (error) {
      // Preserve our guards (expiry/unload) rather than disguising them as host errors.
      if (error?.step !== key && ['EXPIRED_OR_UNLOADED', 'UNLOADED'].includes(error?.code)) throw error;
      const safe = error?.step === key ? error : hostError(error, key);
      if (!readOnly || !safe.transient || attempt >= 1) throw safe;
      await delay(150); // One bounded retry of the same read; NEVER retry a save.
      continue;
    }
    return value;
  }
}
