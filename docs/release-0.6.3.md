# KnowStack 0.6.3 官方平台更新材料

> **准备完成不等于发布。** 本材料用于把现有知栈升级到 0.6.3；尚未上传、提交审计或在平台发布，也未创建 GitHub Release。真实宿主安装、最旧支持版本及其他操作系统仍待验收。`PluginCheck` / `PluginPack` 通过不能代替这些验收或平台审核。

## 上传对象与源码锚点

准备时已在作者控制台只读核实：`local.project-memory-api-probe` 是账号已有的 KnowStack，线上为 **0.4.4**。本次更新同一插件，不创建新 ID。

| 字段 | 本次值 |
| --- | --- |
| 名称 | 知栈 · KnowStack |
| 插件 ID | `local.project-memory-api-probe` |
| 版本 | `0.6.3` |
| 源码仓库 | https://github.com/new-Beginner/KnowStack |
| 源码 tag | `v0.6.3` |
| 源码提交 | `25730b8b3317e58c5dd29bf48e2874044d658c95` |
| 固定源码链接 | https://github.com/new-Beginner/KnowStack/tree/v0.6.3 |
| 官方打包产物 | `dist/local.project-memory-api-probe-0.6.3.piplug` |
| 文件大小 | 2,899,250 字节 |
| SHA256 | `31f3255b574e22959c86ff829c554615cfdf22ac176c9b719526ac6eee7fbbdf` |
| 清单声明的宿主范围 | `>=0.20.1`，未在最旧版本逐项实测 |

安装包由 PI-Desktop `PluginPack` 生成。为排除工作区中两张未提交的旧版截图，先从上述源码提交导出干净快照，导出时仅为该命令设置 `core.autocrlf=false`，不改 Git 配置。包内 125 个文件均逐字节匹配该提交，全部为 store-only，无嵌套安装包、其他插件包或临时目录。本发布说明属于之后补充的材料，不包含在该源码标签和安装包内；包的校验值以 `dist/SHA256SUMS-0.6.3.txt` 为准。

## 可直接粘贴的更新说明

```text
KnowStack 0.6.3：长期项目记忆与正式侧栏

- 长期记忆优先保存仓库、项目约束、稳定决策和可定位的会话索引，避免阶段日志；每轮开场读取，收尾仅保存经验证的新知识。
- 新增按原 ID 修改记忆；模型删除使用独立开关，默认关闭，须有最新读取和具体证据。自动保存不授权删除。
- 项目记忆改为右侧工作面板内嵌标签页；侧栏与设置共用项目级自动保存/模型删除配置，保留草稿、项目归属和保存后回读保护。
- 优化首次加载及已打开侧栏时跨项目对话切换，隔离旧请求，不再额外等待下一轮轮询。
- 修复设置列表滚动回跳、未知自动保存状态被误报为关闭；侧栏显示项目名称，精简文案并使用可访问图标按钮。
- 设置、侧栏和提醒卡跟随宿主主题，覆盖青叶·浅绿、浮影和默认浅深色；保留默认颜色回退及实时切换。
- 最终回复直接显示疑似过时记忆提醒；改进公开错误码与有限只读恢复，任何不确定写入不自动重放。

升级提示：相较平台 0.4.4，正式侧栏新增 ui.view 展示权限，需按宿主流程重新加载并确认授权，然后重启当前会话 Agent。自动保存默认开启，模型删除默认关闭，已有项目设置保留。

已通过 202 项 Node 回归及主题、侧栏、设置、切换、输入和提醒浏览器检查。浏览器使用模拟项目，并非实际宿主安装验收。原生记忆仍经固定内部 Renderer 通道整表保存，不能保证其他窗口并发修改时的原子性；平台兼容及审计结论以实际审核为准。
```

## 提交前保留的说明

- 权限：`agent.tool.register`、`agent.extension`、`renderer.extension`、`ui.view`。前三项有高风险授权提示；相较平台 0.4.4 新增的是普通侧栏展示权限 `ui.view`，没有新增网络、文件、桌面或更广会话权限。
- 修改记忆始终可用，不受自动保存开关限制；自主删除默认关闭且独立控制。手动删除仍先修改草稿，保存后才生效。
- 仅使用原生记忆；不接入 Jev、第二套文件知识库、宿主数据库或宿主源码修改。现有内部 Renderer IPC 与 DOM 适配仍属于兼容性边界，不应描述成全部使用公开 SDK。
- 保存前核验会话、项目与快照，保存后回读；宿主整表保存不是跨窗口原子比较并交换。结果不确定时停止继续写入，不盲目重试。
- 新能力与主题在真实 Chromium + 模拟宿主中验证；没有用真实重要记忆试改试删，也没有宣称商店批准。

## 已执行的发布检查

| 证据 | 结果与范围 |
| --- | --- |
| `node --test tests/*.test.cjs` | 202 通过，0 失败 |
| `node tests/theme-cdp.cjs` | 31 通过，0 失败，卸载清理通过 |
| `node tests/docked-cdp.cjs` | 128 通过，0 失败 |
| `node tests/settings-cdp.cjs` | 24 通过，0 失败 |
| `node tests/switching-cdp.cjs` | 18 通过，0 失败 |
| `node tests/memory-input-cdp.cjs` | 8 组通过，0 失败 |
| `node tests/outdated-cdp.cjs` | 22 通过，0 失败 |
| 根目录 JS、Renderer MJS 与测试 CJS 的 `node --check` | 全部通过 |
| `git diff --check`、提交前凭证特征扫描 | 无空白错误，未发现凭证特征；不等同于完整安全审计 |
| `PluginCheck` 与 `PluginPack` | 通过；保留现有高风险权限授权提示 |
| 包与源码 tag 对比 | 125 个文件的内容与路径全部匹配；全部 store-only |

具体实现和证据见 [0.6.0 能力及边界](verification-0.6.0.md)、[切换修复](verification-switching-0.6.1.md)、[设置修复](verification-0.6.2.md)、[主题修复](verification-0.6.3.md)。模拟性能数据不是实机性能承诺。

## 继续官方更新

1. 在 [官方作者控制台的发布新版本页](https://plugins.aiuo.net/console/publish/upload) 选择 **KnowStack — local.project-memory-api-probe**。
2. 选择本次 `dist/local.project-memory-api-probe-0.6.3.piplug`，核对版本为 0.6.3，不要选择同目录的 Side Chat 或历史版本包。
3. 源码 tag 填 `v0.6.3`，更新说明使用上方文案；确认 GitHub 上 tag 已可访问且仍指向固定源码提交。
4. 检查包的 SHA256 与本文件一致，保存所有真实侧栏草稿，按 [0.6.3 实机验收步骤](verification-0.6.3.md) 确认安装及主题切换。
5. 用户确认后再执行“上传并审计”。审计结果、拒绝原因及实际发布状态均以平台回执为准，本次仅停在准备阶段。

官方依据：[插件开发指南](https://github.com/vastsa/PI-Desktop/blob/main/docs/plugin-development.md)。`pi-plugin publish` 只生成本地 `.submission.json` 和包，不会上传；本次使用宿主官方工具打包，网页更新表单只要求插件、包、源码 tag 和更新说明，不需要为准备工作创建平台提交。
