import { runMemoryTest } from "./memory-test.mjs";

let timer;
let stopped = true;
let busy = false;

export async function onLoad(pi) {
  onUnload();
  stopped = false;
  busy = false;
  const bridge = globalThis.piDesktop;
  const channels = bridge?.channels?.invoke;
  await pi.dispatch("plugin.call", {
    method: "reportRendererCapabilities",
    args: {
      probeVersion: "0.1.4",
      rendererLoaded: true,
      hostBridgeVisible: bridge !== undefined && bridge !== null,
      hostInvokeVisible: typeof bridge?.invoke === "function",
      nativeMemoryReadChannelVisible: typeof channels?.projectMemoryGet === "string",
      nativeMemorySaveChannelVisible: typeof channels?.projectMemorySave === "string",
      groupMemoryReadChannelVisible: typeof channels?.projectGroupMemoryGet === "string",
      groupMemorySaveChannelVisible: typeof channels?.projectGroupMemorySave === "string",
    },
  });
  const poll = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const job = await pi.dispatch("plugin.call", { method: "nextMemoryTest", args: {} });
      if (!job || stopped) return;
      const guardedBridge = {
        channels: bridge?.channels,
        invoke: (...args) => {
          if (stopped) throw Object.assign(new Error("Plugin unloaded"), { code: "PLUGIN_UNLOADED" });
          return bridge.invoke(...args);
        },
      };
      const result = await runMemoryTest(guardedBridge, job);
      if (!stopped) await pi.dispatch("plugin.call", { method: "reportMemoryTest", args: result });
    } catch {
      // Do not log host exceptions, which may contain user data. No write is retried.
      console.warn("Memory diagnostic polling/reporting failed; inspect the queued test status.");
    } finally {
      busy = false;
    }
  };
  timer = setInterval(() => { void poll(); }, 1000);
  timer.unref?.();
}

export function onUnload() {
  stopped = true;
  if (timer !== undefined) clearInterval(timer);
  timer = undefined;
}
