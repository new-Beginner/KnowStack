# Project memory API probe — 0.1.x 历史说明

> 以下内容归档自合并前的 README。工具名、旧权限、安装步骤和实机结果仅属于 0.1.x 诊断插件，不适用于 0.2.0。现有 manifest 不加载这些诊断入口。当前使用说明见 [KnowStack](../README.md)。

Inspect PI-Desktop memory API availability, then explicitly test native-memory read/create/update/delete using one temporary card.

**High risk and experimental:** the CRUD test uses internal renderer IPC, not a supported public memory API. It saves whole entry lists. Pre-save rechecks reduce but cannot eliminate concurrent-save races. Do not edit memory, switch projects, reload, or unload the plugin during a test. Marketplace acceptance is unverified.

## Load and inspect

1. Load this repository root as a development plugin.
2. Review and grant `agent.tool.register`, `desktop.control`, and `renderer.extension`. Upgrading from 0.1.0 needs explicit reload and the new renderer grant; subsequent source edits can hot-reload.
3. Call `inspect_project_memory_api` with `{}`.

The fully qualified inspection tool is `plugin_local_project_memory_api_probe_inspect_project_memory_api`. Expect `probeVersion: "0.1.4"` and `rendererProbe.status: "reported"`. The availability probe reports booleans without invoking internal IPC. Loading and inspection never queue a test or write memory. `memoryModified: false` describes inspection itself; separately requested tests appear in `lastMemoryTest`.

## Test native memory CRUD

Only run after the user explicitly authorizes a temporary-card CRUD test. Call `plugin_local_project_memory_api_probe_test_project_memory_crud` with:

```json
{
  "confirm": true,
  "expectedProjectPath": "D:/32057/Files_of_Desktop/Academic/AI/Pi-plugin/pi-desktop-plugins"
}
```

The path must match the current workspace. A new tool may not enter an already-running Agent turn's discovery catalog until a subsequent user turn.

The tool queues one request with a 60-second expiry. The renderer claims it once, resolves the current project's unique group (or explicitly identified legacy project), and performs:

1. Read native memory without returning existing text to the Agent.
2. Create one uniquely marked `pi-memory-probe-*` card and read it back.
3. Update only that card and read it back.
4. Remove only that card and read back to verify its absence.

Each save rechecks the active project, group identity, and full memory snapshot. Unknown entry fields, duplicate IDs, noncanonical entries, and nonempty legacy text without structured entries stop the test before saving. Cleanup re-reads current entries and retains all non-test entries; it never blindly restores an old snapshot. An externally edited test card is not deleted.

Call inspection again and examine `lastMemoryTest`:

| Field | Meaning |
| --- | --- |
| `status` | `not_run`, `queued`, `running`, `passed`, `failed`, or `inconclusive` |
| `steps` | Only operations with successful read-back checks |
| `cleanup` | `verified`, `not_needed`, or `unverified` |
| `existingMemoryPreserved` | Whether final structured entries exactly match the initial entries, ignoring object field order |
| `testId` | The only temporary card ID authorized for deletion |
| `initialEntryCount`, `finalEntryCount` | Entry counts; no existing memory content is returned |

A `passed` result requires all four steps, verified cleanup, and unchanged existing entries. `cleanup: "verified"` alone does not mean CRUD passed: a rejected creation can leave nothing to clean up. `existingMemoryPreserved: false` can indicate concurrent external edits; it does not by itself prove data loss.

If cleanup is unverified, **do not rerun**: inspect the reported card ID through the native memory UI. Expired claimed tasks block reruns in that plugin load. State is transient; reloading loses tracking and does not prove cleanup. Expiry, project changes, host errors, or unload may leave the test card behind. Never delete an unrelated card or edit the database to finish this test.

## Leave one test card for manual inspection

After explicit user authorization, call `plugin_local_project_memory_api_probe_write_test_project_memory` with the same confirmation and current-project arguments shown above. It creates one card titled `插件写入验证`, containing a test notice and its unique ID, then reads it back. It never updates or deletes the card, including on an uncertain failure. The user inspects and manually deletes it in the native memory UI.

Success is reported as `status: "passed"`, `cleanup: "retained_by_request"`, and only the `read` / `create_and_read_back` steps. Original entries must remain unchanged, while the final count increases by one. If a write is unverified, stop and inspect its ID rather than retrying. Ordinary CRUD jobs cannot report retained cards as success. Loading, reloading, and inspection never queue this operation automatically.

## Scope and permissions

- `desktop.control`: broad permission, used only to list operation metadata, never `pi.desktop.invoke`.
- `agent.tool.register`: registers read-only inspection and the explicitly confirmed high-risk test.
- `renderer.extension`: runs trusted code in the host renderer; enables fixed workspace/group/memory IPC calls only for a queued test.
- No host-source changes, direct storage access, transcript reads, file operations, or network requests.
- Internal IPC compatibility and publication approval are not guaranteed by a successful local test.

## Run local checks

Requires Node.js 22 or later; no dependencies. Historical source checks, run from the repository root:

```bash
node --check legacy-probe-main.js
node --check memory-jobs.js
node --check renderer/probe.mjs
node --check renderer/memory-test.mjs
node --test tests/probe.test.cjs tests/memory.test.cjs
```

These are simulated-host tests, not evidence of real-host write success. The 0.1.4 package was `dist/local.project-memory-api-probe-0.1.4.piplug`; never build a package with a generic ZIP tool. Historical probe tests now use `tests/probe-manifest.json` instead of the active manifest.

## Verified historical host run

On PI-Desktop 0.20.1, plugin 0.1.3 completed native project-group CRUD with test ID `pi-memory-probe-1792250833844-g6xwdizko6`. All four read-back steps passed; cleanup was `verified`, and entry counts were 0 before and 0 after. This verifies an empty real store; preservation of pre-existing entries is covered by simulated-host tests, not this real run. No host source or database was edited directly.

The initial real attempt exposed a missing IPC response unwrap. Native preload invocation returns `{ ok, data }` / `{ ok: false, error }`, unlike plugin SDK calls. The renderer now unwraps and validates that envelope; regression fixtures use the same contract and suppress raw host errors.

## References

- [Official plugin development guide](https://github.com/vastsa/PI-Desktop/blob/main/docs/plugin-development.md)
- [Plugin API: desktop control](https://github.com/vastsa/PI-Desktop/blob/main/docs/spec/07-plugins/03-plugin-api.md)
