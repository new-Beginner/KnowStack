# KnowStack 0.3.0 验证说明

## 结果与范围

- 9 个正式入口／模块的 `node --check` 通过。
- `node --test tests/*.test.cjs`：94 项通过，0 项失败。
- Chrome 无头浏览器：桌面窗口 1100×850、窄屏窗口 390×850 各运行 9 项交互回归，全部通过。窗口尺寸为启动参数，网页可用视口受浏览器边框影响。
- `git diff --check` 通过；Git 的 LF／CRLF 提示不是代码错误。
- `PluginCheck(directory=".")` 通过，只有既有高风险权限需用户授权的提示；没有新增权限。

浏览器使用真实 DOM 和正式的 `renderer/settings-ui.mjs`、`renderer/project-controls.mjs`，宿主项目与保存回调均为模拟。此次未创建／删除真实项目，没有重新执行真实原生记忆写入验收，也不将浏览器模拟测试等同于运行中宿主的端到端验收。

## 覆盖的行为

| 层次 | 证据 | 结论 |
| --- | --- | --- |
| 设置存储 | `tests/project-settings.test.cjs` | 默认开／关初始化、旧选择保留、项目删除清理、重启恢复、并发写入、失败恢复、当前 Renderer 凭证校验 |
| 多文件夹项目 | 设置与控制器测试 | 同组只展示一行；旧配置冲突时主文件夹优先，无主文件夹旧值时使用已有文件夹值；工具卡切换任一文件夹时整组一致 |
| 项目扫描 | `tests/project-controls.test.cjs` | 启动、事件与周期核对；忽略远程项目，失败／异常列表不转为空列表；新增根继承项目选择，移除根清理设置 |
| UI | `tests/settings-browser.html` | 设置按钮只拦截本插件、无文本输入框、左名右开关、即时保存、失败不显示成功、名称按纯文本展示 |
| 可用性 | 浏览器同页回归 | 关闭后恢复入口焦点、Tab 循环、Escape 关闭、重复打开不叠加、60 项列表滚动、窄屏无重叠 |
| 原有记忆流程 | 全量测试 | 自动与人工确认、会话绑定、只追加、冲突保护和回读状态的模拟回归未受影响 |

界面截图：[桌面](settings-0.3.0.png) · [窄屏](settings-0.3.0-narrow.png)。截图包含模拟数据，不是用户真实项目设置。

## 复现

从项目根目录运行：

```bash
for file in knowstack-main.js memory-service.js project-settings.js knowstack-extension.js renderer/native-memory.mjs renderer/receipt-state.mjs renderer/project-controls.mjs renderer/settings-ui.mjs renderer/knowstack.mjs; do
  node --check "$file" || exit 1
done
node --test tests/*.test.cjs
git diff --check
```

浏览器检查无需第三方依赖：用允许本地 ES 模块的浏览器打开 `tests/settings-browser.html`，点击“运行交互回归”；也可追加 `?autorun` 自动运行。默认示例设置仅保存在测试页内存中。

Chrome 无头检查示例（把文件 URI 和截图输出替换为本机实际绝对路径）：

```bash
chrome --headless=new --disable-gpu --allow-file-access-from-files \
  --window-size=1100,850 --virtual-time-budget=5000 --dump-dom \
  'file:///absolute/project/tests/settings-browser.html?autorun'
```

HTML 中 `#results` 应显示 `passed: 9`、`failed: 0`。使用新的临时 `--user-data-dir` 可避免与正在运行的浏览器共享进程。

发布时使用宿主工具 `PluginCheck(directory=".")`、`PluginPack(directory=".")`，不要手工压缩安装包；版本来自 `manifest.json` 的 `0.3.0`。

## 宿主兼容边界

宿主项目列表复用固定的 `projectGroupList` 通道，返回 `groups` 及项目 `roots`。当前没有专用项目变更通知，因此启动／打开设置页扫描，并结合 `sessionsChanged` 通知和每 2 秒轮询核对；不是通过修改或代理全局 IPC 函数实现。

当前宿主的原生插件设置弹窗没有自定义控件插槽。KnowStack 在 Renderer 中使用 `pi.ui.openLayer()`，通过精确插件 ID、插件行和唯一设置按钮匹配，仅接管自己的设置入口。未来宿主插件页 DOM 变化可能需要更新适配；不支持时原生基础设置仍只显示默认开关，不再显示项目 JSON。

`projectModes` 从公开设置声明中移除，但仍经插件自身 `pi.plugin.getSettings/setSettings` 保存在原设置存储内；宿主通用设置表单的未声明字段校验不适用于该插件内部调用。没有读取数据库、增加文件权限或建立第二套记忆文件。仅项目设置清理不涉及任何原生记忆条目。
