# KnowStack 0.4.0 侧边栏记忆管理验证

## 结果与范围

新增侧边栏底部书本入口，读取宿主原生项目记忆，支持按项目新增、编辑、删除、重新读取及统一保存。所有修改先保留为草稿，点击保存才写入；不开放 Agent 修改或删除旧记忆的接口。

| 检查 | 结果 |
| --- | --- |
| 正式入口与全部 Renderer 模块 `node --check` | 通过 |
| `node --test tests/*.test.cjs` | 110 项通过，0 失败 |
| 记忆管理，CDP 设备视口 1100×900 | 14 项通过，0 失败 |
| 记忆管理，CDP 设备视口 390×850 | 14 项通过，0 失败 |
| 原有项目设置，CDP 设备视口 1100×850 | 10 项通过，0 失败 |
| 原有项目设置，CDP 设备视口 390×850 | 10 项通过，0 失败 |
| `git diff --check` | 通过；仅既有 LF/CRLF 转换提示 |
| `PluginCheck` | 通过；仅既有高风险权限授权提醒，无新增权限 |
| 一次新增代码只读审查 | 未发现具体可复现缺陷 |

浏览器检查使用真实 Chrome DOM、正式 UI 模块、宿主 0×0 弹层挂载结构及模拟项目数据。没有修改真实项目记忆，没有模拟真实宿主安装或授权。未在运行中 PI-Desktop 内安装/重新加载新包，也未执行真实侧边栏点击和记忆增删改端到端验收。

截图：[桌面](memory-0.4.0.png) · [390px 窄屏](memory-0.4.0-narrow.png)。截图是模拟界面，不是用户当前宿主窗口。

## 关键证据与实现路径

| 证据 | 结论 | 实现路径 |
| --- | --- | --- |
| 新增 `tests/memory-editor.test.cjs` 16 项 | 读取不写入；草稿隔离；明确保存；删除全部；失败与冲突保护；旧路径项目；串行队列；重复保存保护 | `renderer/memory-editor.mjs` |
| `tests/memory-browser.html` 14 项交互回归 | 删除和放弃草稿需确认；输入不中断；项目切换隔离；零尺寸弹层可点击；空正文拦截；回执、键盘、窄屏、长列表、重挂载和卸载可用 | `renderer/memory-ui.mjs` |
| 已有工具卡及原生追加回归 | Agent 工具继续只追加，使用与手动编辑共享的本地执行队列 | `renderer/knowstack.mjs`、`renderer/native-memory.mjs` |
| 只读检查本机宿主 Renderer | 侧边栏操作区为 `.sidebar-footer .footer-actions`，原生项目记忆使用既有固定 get/save 通道 | 只插入自有按钮，不修改宿主文件或全局 IPC |

浏览器测试初次未执行的原因是测试数据中未转义的 HTML 结束标签截断模块脚本，转义后继续检查。另修正模拟项目排序假设，明确按名称排序的首项。正式模块无需为这两个测试夹具问题更改行为。

Chrome 无头模式的 `--window-size=430,900` 不能单独证明实际布局宽度为 430px：本机观察到最小布局宽度，截图会被裁切。最终通过 CDP `Emulation.setDeviceMetricsOverride` 明确设置视口，并读取 `innerWidth`/`innerHeight` 核对后完成检查；窄屏截图已替换成实际 390×850 视口结果。

## 复现

从项目根目录运行：

```bash
for file in knowstack-main.js memory-service.js project-settings.js knowstack-extension.js renderer/*.mjs; do
  node --check "$file" || exit 1
done
node --test tests/*.test.cjs
git diff --check
```

使用允许本地 ES 模块的 Chrome 打开 `tests/memory-browser.html`，点击“运行交互回归”，`#results` 应显示 `passed: 14`、`failed: 0`。已有设置页 `tests/settings-browser.html` 应显示 `passed: 10`、`failed: 0`。可使用 `--allow-file-access-from-files` 或通过本地静态服务器访问；测试只在页面内存保存模拟数据。

窄屏验收用 DevTools 设备工具栏设置 390×850，刷新后运行测试，并在控制台核对 `innerWidth === 390`。不能只依据浏览器窗口参数或裁切后的截图判断响应式通过。

发布使用 `PluginCheck(directory=".")`、`PluginPack(directory=".")`。manifest、Renderer 握手、版本断言和安装包文件名同步为 0.4.0；安装包为 `dist/local.project-memory-api-probe-0.4.0.piplug`。

## 已知边界与用户验收

- 默认显示按名称排序的首个本地项目，不声称自动识别当前聊天项目。保存前应核对项目选择框和路径。
- 侧边栏没有正式扩展插槽，入口依赖宿主 DOM 适配；宿主变更结构可能需要更新插件。
- 原生接口整表保存没有原子比较并保存能力。本地串行化及保存前后校验不能阻止其他窗口在最后检查与写入之间修改记忆；保存时避免多处同时编辑。
- 保存结果不确定或冲突时，保留草稿并禁用再次保存，需用户重新读取核对；不会自动重试、删除或覆盖回滚。
- 保存进行中阻止正常关闭；强制卸载/重载可能使结果无法确认，之后应独立核对原生记忆。
- 含旧式自由正文或未知字段的记忆拒绝自动转换，避免静默丢失内容。

安装新包后，在侧边栏底部点击书本图标，核对所选项目；先验证读取，再手动添加一条测试记忆并保存、独立重新读取，最后删除测试记忆并再次读取。此实机验收尚未执行，不能用上面的模拟测试代替。
