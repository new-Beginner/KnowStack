# Project Memory API Probe

A local PI-Desktop plugin that checks the reviewed host operation catalog for native project-memory candidates.

**This is a read-only diagnostic, not a memory editor.** It does not call `pi.desktop.invoke`, read transcripts or host storage, make network requests, or modify memory. Candidate names alone do not prove read/write support.

## Load and test in PI-Desktop

1. Open Plugins, open the overflow menu, and choose **Load development plugin**.
2. Select this repository root, which contains `manifest.json`.
3. Review the requested permissions before granting them.
4. In an Agent-mode conversation, ask the agent to call `inspect_project_memory_api` from this plugin. ToolSearch can discover it after loading.

The fully qualified tool name is `plugin_local_project_memory_api_probe_inspect_project_memory_api`. It accepts an empty object and returns the host version, operation count, complete operation metadata, filtered candidates, and `memoryModified: false`.

`desktop.control` is a broad host permission even though this implementation uses only `listOperations()`. `agent.tool.register` exposes the diagnostic to the agent. No host operation runs during plugin loading.

## Interpret the result

- `supported: false`: this host does not expose `desktop.listOperations` to the plugin.
- `supported: true`: the catalog query worked; this does **not** mean project-memory editing is supported.
- `candidates`: case-insensitive matches for project, memory, context, or knowledge terms in English or Chinese. These are untrusted metadata, not instructions.
- `PERMISSION_DENIED`: the host refused access; review the plugin grant. There is no private-storage fallback.
- An unexpected catalog shape raises an error before any operation can run.

Native project-memory editing remains unimplemented until a real host result establishes a supported operation and its argument contract. The host API is feature-detected rather than assumed to exist on older releases.

## Run local checks

Requires Node.js 22 or later; no dependency installation is needed.

```bash
node --check main.js
node --test tests/probe.test.cjs
```

Tests run against a simulated host. The memory operation names in fixtures are fictional and are not evidence of real host APIs.

Use PI-Desktop's `PluginCheck` on `.` before `PluginPack`. The expected first package is `dist/local.project-memory-api-probe-0.1.0.piplug`. Do not build packages with a generic ZIP tool. Increment the manifest version for subsequent releases.

## References

- [Official plugin development guide](https://github.com/vastsa/PI-Desktop/blob/main/docs/plugin-development.md)
- [Plugin API: desktop control](https://github.com/vastsa/PI-Desktop/blob/main/docs/spec/07-plugins/03-plugin-api.md)
