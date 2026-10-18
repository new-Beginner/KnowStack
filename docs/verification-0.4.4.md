# KnowStack 0.4.4 上架兼容修复与验证

0.4.4 用新的实现消除入口与动态模块加载两项自动预审阻断，保留现有记忆工作流。只生成本地新包，不提交 Git、不推送、不上传商店，不覆盖旧 0.4.3 包。

> 自动检查通过不等于真实 Windows/Electron 宿主验收或商店批准。当前窗口 DOM 身份标记和原生记忆内部 Renderer IPC 仍是兼容边界；整表保存仍不具备跨窗口原子并发保护。

## 修复及证据

| 证据 | 结论 | 实现位置 |
| --- | --- | --- |
| 清单与实际入口测试通过 | 正式入口为 `main.js`，修复原 `MAN007`；原诊断入口移至 `legacy-probe-main.js` | `manifest.json`、`main.js`、`tests/knowstack.test.cjs`、`tests/probe.test.cjs` |
| 无动态加载断言及官方源码预审 0 blocker | 不再加载宿主入口模块或抽取内部状态仓库，修复原 `SEC003` | `renderer/panel-context.mjs`、`tests/panel-context.test.cjs` |
| 窗口隔离、无聊天项目、异步过期及 A→B→A 测试通过 | 当前窗口身份变化使旧结果和旧草稿保存失效，不回退其他项目 | `tests/panel-context.test.cjs`、`tests/memory-editor.test.cjs` |
| Chrome DOM 回归与可信输入测试通过 | 新 DOM 适配可驱动模拟项目编辑器；页内确认后能继续输入与退格 | `tests/memory-browser.html`、`tests/memory-input-cdp.cjs` |

### 当前窗口项目识别

1. 优先读取 `[data-session-pane][data-visible="true"]` 的会话 ID；无可见 pane 时使用 `.thread-item.active[data-sidebar-session-row]`。
2. 有会话时，复用固定 `sessionGet` 通道解析真实项目路径，限制 `messageLimit: 1`、`contentLimit: 1`；解析结果仅保留会话 ID 和项目路径，不使用消息正文或草稿。
3. 无聊天时，读取唯一的 `[data-sidebar-project-group][data-current-workspace="true"]` 本地项目路径。归属仍通过现有项目组列表复核，多文件夹项目使用同一原生记忆。
4. 属性缺失、歧义、非法路径或远程身份均停止读写，不改成手动选项目，不借用共享工作区。
5. MutationObserver、窗口 focus 和文档 visibilitychange 触发核对。异步解析完成前后重查 DOM，身份代次不同即丢弃旧结果。
6. 显式读取等待最新身份解析完成；保存前同步重读身份、复核会话归属和快照。有草稿时保留原内容并禁用保存，重新读取后才恢复。
7. 关闭编辑器／卸载时释放 observer、事件和订阅，唤醒并中止尚未完成的读取；晚到响应不能恢复旧窗口状态。

参考实现为用户指定的 `pi-session-usage/renderer/session-context.mjs`；KnowStack 额外处理无聊天当前项目、受限异步路径解析及保存代次保护。参考插件与宿主源码未修改。DOM 标记不是官方稳定 SDK，不能以本实现推断所有宿主版本均兼容。

## 已执行检查

- 对正式／诊断入口、Renderer 模块及 CJS 测试执行 `node --check`：通过。
- `node --test tests/*.test.cjs`：**132 通过，0 失败**；覆盖原自动追加、人工确认、项目开关、手动增删改及新上下文保护。
- `KNOWSTACK_SCREENSHOT_DIR="$PI_SCRATCH_DIR" node tests/memory-input-cdp.cjs`：桌面／窄屏 DOM 回归均无失败，**8 组可信输入场景通过，0 失败**。截图写入临时目录，未覆盖旧版项目证据。
- `git diff --check`：通过；Git 的 LF/CRLF 提示不是空白错误。
- 使用未修改规则的官方 `vastsa/pi-desktop-plugins/scripts/security_audit.py` 检查源码：**0 blocker，22 manual-review signals**，退出码 0。
- `PluginCheck(directory=".")`：通过，70 个打包文件；仅提示现有高风险权限 `agent.tool.register`、`agent.extension`、`renderer.extension` 需要显式授权，未新增权限。

官方预审需将源码放到临时审计根目录的 `plugins/local.project-memory-api-probe/`，脚本放到 `scripts/security_audit.py`，在该布局运行：

```bash
python scripts/security_audit.py plugins/local.project-memory-api-probe
```

22 项人工信号包括宿主权限兼容策略、读取凭证／敏感信息处理、常驻计时器，以及包中保留的历史参考源码和测试脚本的文件／进程／网络操作。没有删除参考源码、混淆代码或修改审计规则来隐藏这些信号。人工审查仍必须核对实际执行入口和固定 IPC 边界。

成包一致性复核发现 PluginPack 对中文文件名未设置 ZIP UTF-8 标记，Python 官方核对器因而将历史说明文档名称解码为另一名称。将该文档仅改名为 `KnowStack-requirements.md`（正文不变）并更新 README 链接，以兼容成包核对；不手工修改安装包或审计器。

## 安装与剩余验收

使用 `PluginPack(directory=".")` 生成 `dist/local.project-memory-api-probe-0.4.4.piplug`。旧包 `local.project-memory-api-probe-0.4.3.piplug` 的 SHA-256 保持为：

```text
d58abb460f354f43813fbc15afc37d7385617dfd159662cbe93f4515a56dc708
```

安装新包后仍需在真实宿主验证：

- 不同窗口各自跟随本窗口项目；项目已打开但无聊天时也能查看原生记忆。
- 自动追加、关闭自动后的工具卡人工确认，以及手动编辑保存均有正确回读回执。
- 带草稿切换项目、快速切换、关闭／重开均不串项目或自动保存旧草稿。
- 取消／确认删除、保存并关闭后，聊天框无需切换侧栏即可继续输入。

浏览器测试只使用模拟项目数据，没有在本轮写入真实项目记忆或代替用户安装。商店 22 项人工信号、真实宿主行为及最终上架审核尚待验收。
