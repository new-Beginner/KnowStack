# 知栈 0.6.3：宿主主题跟随

> 本轮目标仅为当前工作区的知栈（KnowStack，`local.project-memory-api-probe`）。按用户要求保留上一轮侧边聊天内容，不回退也不再修改相邻插件。未修改PI-Desktop宿主源码、权限、记忆读写、项目设置、会话跟随或模型配置。测试为真实Chromium＋模拟记忆及公开外观事件，不冒充已安装宿主GUI验收。

## 根因

1. 独立记忆侧栏原来只更新 `data-base` 浅深色标记，没有应用官方外观返回的 `pluginTheme.css`，也没有同步该CSS所需的 `data-theme` 选择器，所以主题的 `--ds-*` 变量未进入自己的文档。
2. 设置、条目、按钮、提醒卡片使用旧别名及固定蓝色，未映射到宿主设计变量。

## 最小修复

- 新增 `renderer/theme.mjs`，用只作用于知栈组件的 `--ks-*` 映射宿主 `--ds-*`。只覆盖颜色属性，不改尺寸、布局或业务处理；不在宿主文档中写入全局变量。
- `renderer/knowstack.mjs` 仅导入并追加主题样式，及同步版本握手；工具卡及其他JavaScript业务逻辑不变。
- `renderer/memory-view.mjs` 只在侧栏自己的文档内应用官方主题CSS，同步 `data-theme/data-base`，通过既有 `appearance:changed` 实时更新；清空默认主题的旧CSS，卸载时移除样式。
- `renderer/memory-view.html` 将已有颜色别名映射到 `--ds-*`，保留原浅深色默认值。

| 插件变量 | 宿主变量 | 区域 |
| --- | --- | --- |
| `--ks-panel` | `--ds-bg-dock` / `--ds-bg-primary` | 侧栏背景 |
| `--ks-surface` | `--ds-bg-elevated-opaque` | 设置、弹窗背景 |
| `--ks-secondary` | `--ds-bg-secondary` | 记忆条目、默认设置区、提醒卡片 |
| `--ks-input` | `--ds-bg-tertiary` | 输入区域及悬停背景 |
| `--ks-ink` / `--ks-muted` | `--ds-text-primary` / `--ds-text-secondary` | 主次文字 |
| `--ks-line` | `--ds-border-default` | 边框及分隔线 |
| `--ks-accent` / `--ks-accent-ink` | `--ds-accent` / `--ds-bg-primary` | 按钮及文字、卡片强调色 |
| 状态及控件变量 | `--ds-warning/error/success/focus/switch-*` | 提醒、错误、焦点和开关 |

宿主变量缺失时，各使用点仍回退到旧别名及原默认色。没有把无主题的默认配色强制替换为另一套颜色。

## 已执行验证

使用实际主题颜色快照 `tests/theme-fixtures.json`：

- 「青叶 · 浅绿」：主题工坊 `pi.theme.studio:custom-3`，light。
- 「Sax Dark · 浮影」：`adoin.sax-design-theme:sax-dark`，dark。

测试数据仅包含颜色变量及必要依赖，不复制字体、图片或宿主布局规则。`tests/theme-browser.html` 加载正式记忆侧栏、正式设置组件和从正式Renderer提取的样式，模拟公开 `app.getAppearance` / `appearance:changed`。

| 检查 | 结果 |
| --- | --- |
| `node tests/theme-cdp.cjs` | 31项通过：420/320px，两主题背景/文字/按钮/边框/条目、卡片及提醒、默认回退、同主题等长CSS更新、卸载清理 |
| `node --test tests/*.test.cjs` | 202项通过，0失败 |
| 原侧栏/设置/切换浏览器检查 | 128 / 24 / 18项通过 |
| 旧输入/提醒流程 | 8组 / 22项通过 |
| 语法及 `git diff --check` | 通过；仅原有Windows换行提示 |

修复前主题测试复现20项失败；修复后全部通过。默认色通过关闭/开启主题映射层进行浅深色逐项对比；主题切换前后的记忆条目、输入值、项目状态和模拟写入数量不变，保存请求为0。

对照本轮开始快照，记忆服务、原生访问层、编辑控制器、项目设置及跟随模块、原设置/编辑/提醒UI逻辑均逐字节不变。Renderer入口移除新增样式导入、插值和版本号差异后，与快照完全相同；manifest除版本号外不变。

截图位于 `docs/verification-0.6.3/`：两主题的420/320px记忆侧栏和设置弹窗。截图使用模拟条目，已目视核对，不代表真实记忆发生了修改。

## 操作验收

1. 正常加载更新后的知栈目录或安装0.6.3包，保持项目记忆侧栏打开。
2. 在宿主切换「青叶·浅绿」与「浮影」，观察侧栏、条目、保存按钮、开关、设置弹窗及记忆卡片立即跟随，不重载记忆或改变开关值。
3. 回到默认浅/深色，确认不残留上一主题CSS；有未保存草稿时切主题，内容及保存状态应保持。
4. 本轮未自动安装、未用真实记忆试改试删；实际宿主界面仍需按上述步骤确认。

```bash
export TMP="$PI_SCRATCH_DIR" TEMP="$PI_SCRATCH_DIR" TMPDIR="$PI_SCRATCH_DIR"
node tests/theme-cdp.cjs
node --test tests/*.test.cjs
```

## 官方依据

- [PI-Desktop app及Panel events](https://github.com/vastsa/PI-Desktop/blob/main/docs/spec/07-plugins/03-plugin-api.md)：`pluginTheme.css`、`app.getAppearance`、`appearance:changed`。
- [官方Theme开发文档](https://github.com/vastsa/PI-Desktop/blob/main/docs/plugin-development.md)：`--ds-*` 与 `:root[data-theme="light"/"dark"]` 主题选择器。
- [CSS变量及回退](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties)：通过var()级联跟随，缺失时使用原fallback。

版本元数据、Renderer握手及安装包名统一为0.6.3。使用官方PluginCheck/PluginPack，不手工压缩，不新增权限、Git提交或推送。
