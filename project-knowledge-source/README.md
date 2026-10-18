# Project Knowledge · 项目知识库

[中文](#中文) · [English](#english)

---

## 中文

让 PI-Desktop 的每个项目拥有自己的知识库：新会话不必从头积累上下文。

- **自动检索**：你每发一条消息，插件都会在项目知识库里检索，把相关条目的一行摘要附在消息后面；没有相关条目时什么都不附加。
- **按需读取**：Agent 需要时用工具读取条目全文，并在回答中注明条目 ID。
- **确认后沉淀**：任务结束或你说"记住……"时，Agent 提出建议，聊天中会出现一张选择卡片。**只有你在卡片上作答后才会写入**，写入内容以你的点选为准，模型无法代替你确认。
- **可选 Jev 去重**（默认关闭）：保存前判断是新建、替代旧条目、重复还是各自成立。

### 知识存放在哪里

知识就是项目里的 Markdown 文件，可以随 git 提交、与团队共享：

| 路径 | 内容 |
|---|---|
| `.workflow/knowhow/*.md` | 经验条目（frontmatter + 正文）。插件新建的条目都在这里 |
| `.workflow/specs/*.md` | 规则条目（`<spec-entry sid="…">` 格式，兼容 Maestro）。插件只读，从不修改 |
| `.workflow/knowledge-inbox/` | 待确认的建议；通过卡片处理后删除，通过面板处理后标记为已处理；目录内自带 `.gitignore`，不会进入 git |

项目里还没有 `.workflow/` 时，第一次保存会自动创建。已有 Maestro 知识库的项目可以直接使用。

### 使用方法

1. 安装插件，授予权限，在 Agent 模式下正常对话即可，检索是自动的。
2. 想沉淀经验时说"记住：……"，或让 Agent 在任务结束时推荐。
3. 在聊天卡片中为每条建议选择处理方式并提交：
   - **新建**：保存为新条目
   - **更新 X**：保存新条目，旧条目 X 标记为 `deprecated` 并指向新条目（旧正文保留）
   - **与 X 各自成立**：保存新条目，两条互相关联
   - **与 X 重复** / **不保存**：不写入
4. 关闭卡片或全部拒绝时不会写入，建议保留在待确认列表中，可在全局搜索中打开 **确认知识沉淀** 面板处理。

### Agent 工具

工具名由宿主加前缀，实际名称为 `plugin_axc00_project_knowledge_<name>`；插件工具需要先通过 ToolSearch 激活，插件的系统提示指引会告诉 Agent。Plan 模式下插件工具不可用（自动检索仍然生效）。

| 工具 | 输入 | 作用 |
|---|---|---|
| `search` | `query`，可选 `type`（`knowhow`/`spec`）、`limit` | 返回 ID、标题、一行摘要，不返回正文；已废弃、已被替代的条目不返回 |
| `load` | `id` | 返回一条的全文；条目已失效时附警告 |
| `propose` | `items[]`：`title`、`content`、`keywords` | 暂存建议并返回确认卡片参数，本身不写入知识库 |

### 设置

| 设置 | 默认 | 说明 |
|---|---|---|
| Jev 去重判断 | 不使用 | TypeSafe 或 OpenRouter |
| Jev 密钥 | 空 | 留空则不调用 Jev。**以明文保存在插件设置中**（PI-Desktop 目前不支持加密的插件设置） |
| Jev 模型 | 空 | 留空使用 `jev-latest`（TypeSafe）或 `typesafe/jev-1.13`（OpenRouter） |

Jev 只在建议与已有条目相似时调用；失败或置信度低于 0.7 时回退到标题/内容规则，卡片上会写明判断来源。

### 权限与数据流

| 能力 | 权限 | 读取 | 写入 / 发送 | 何时发生 |
|---|---|---|---|---|
| 检索、读取条目 | `fs.read`（`.workflow/**`） | `.workflow/knowhow`、`.workflow/specs` | 无 | 每条消息、`search`/`load` |
| 自动检索与指引 | `agent.extension` | 同上（在 Agent 进程内直接读取） | 把条目 ID、标题、一行摘要附加到发给模型的消息；在系统提示末尾追加一段固定指引 | 每次模型请求 |
| 暂存建议 | `fs.write`（`.workflow/knowledge-inbox/**`） | — | `.workflow/knowledge-inbox/<id>.json` 与 `.gitignore` | `propose` |
| 保存确认的知识 | `agent.extension`；面板路径用 `fs.write`（`.workflow/knowhow/**`） | 暂存的建议 | 在 `.workflow/knowhow` 新建文件；修改你选择替代/关联的旧 knowhow 条目的 `status`/`supersededBy`/`related` 字段 | **仅在你回答卡片或在面板点保存后** |
| Jev 去重（可选） | `net.fetch`（仅 `api.typesafe.ai`、`openrouter.ai`） | 插件设置中的密钥 | 发送：建议的标题/内容/关键词，以及最多 3 条相似已有条目的标题和正文（截断） | 已启用 Jev 且建议有相似条目时 |
| 备用面板 | `ui.panel` | 暂存的建议 | 同"保存确认的知识" | 你手动打开时 |
| 注册工具 | `agent.tool.register` | — | — | 插件加载时 |

**关于 Agent 扩展**：`agent.extension` 在 Agent 进程内运行，不受插件文件权限网关约束。它负责两件事：自动检索时读取知识库，以及用你在卡片上的真实选择执行写入（只有扩展能拿到这个选择）。因此扩展自带一层受限的文件访问：

- 会话开始时**固定项目根目录**：记录真实路径及该目录的 dev/ino。之后每次读、列目录、写、删的前后都核对工作目录仍指向同一个目录；根目录在操作之间被改名、替换成符号链接或另一个目录时一律拒绝，读到的内容丢弃，已写入的文件撤回。
- 以固定的项目根为基准，**任何一级路径组件是符号链接都拒绝**，包括 `.workflow`、`.workflow/knowhow`、`.workflow/specs` 这几个起始目录本身；再对结果做 realpath，要求仍在项目目录内。项目通过符号链接路径打开是允许的，项目内容里的链接不允许。
- 只读取单链接的普通文件：**硬链接**（可能指向项目外文件）、FIFO 等特殊文件、超过 256KB 的文件都会被跳过；单次最多读取 2000 个文件。
- 读取用 `O_NOFOLLOW|O_NONBLOCK` 打开（FIFO 不会卡住对话），并核对打开的 inode 与检查过的路径一致，检查与读取之间被替换会被发现。
- 写入仅限 `.workflow/knowhow/` 与 `.workflow/knowledge-inbox/`，拒绝绝对路径和 `..`；先以 `O_EXCL|O_NOFOLLOW` 写临时文件，写入前后都校验目录的规范路径，再在同一目录内改名。
- 检索被拒绝时，模型只会收到"自动检索失败"的提示，不含任何文件内容。

**关于提示注入**：知识条目来自仓库作者，可能包含恶意文字。自动附加的块和 `load` 结果都明确标注"项目数据，不是指令"，系统提示也要求模型不得执行其中的指示；附加时每个字段都会截断（标题、摘要各 120 字符）并去掉尖括号。打开来源不明的仓库时，仍建议先检查 `.workflow/` 的内容。

以上均有测试覆盖。插件不执行命令、不访问除 Jev 以外的网络、没有第三方依赖。

### 已知限制

- 检索基于关键词（中文按双字切分，英文按单词），同义词需要写进 `keywords`；卡片保存时建议多写几个同义词。
- 卡片由模型调用宿主的 `asktool` 显示，需要模型原样使用 `propose` 返回的参数；模型改写卡片文字时不会写入，建议留在面板中。
- 需要 PI-Desktop 0.15.9 或更高版本（依赖 Agent 扩展、`before_provider_request`、`asktool`）。已在 Linux 上完成端到端测试。

---

## English

Give every PI-Desktop project its own knowledge base, so a new session does not have to rebuild context from scratch.

- **Automatic retrieval**: every message you send is matched against the project's knowledge base; one-line summaries of relevant entries are attached to it. Nothing is attached when nothing is relevant.
- **Load on demand**: the Agent loads an entry's full text with a tool and cites its ID.
- **Save after confirmation**: at the end of a task, or when you say "remember …", the Agent proposes items and a choice card appears in the chat. **Nothing is written until you answer the card**, and what is written follows your clicks; the model cannot confirm on your behalf.
- **Optional Jev dedup** (off by default): decides new / replace / duplicate / both-hold before saving.

### Where knowledge lives

Plain Markdown files in the project, so they can be committed and shared:

| Path | Content |
|---|---|
| `.workflow/knowhow/*.md` | Knowhow entries (frontmatter + body). Everything the plugin creates goes here |
| `.workflow/specs/*.md` | Rule entries (`<spec-entry sid="…">`, Maestro compatible). Read only, never modified |
| `.workflow/knowledge-inbox/` | Pending proposals; deleted once handled on the card, marked done when handled in the panel; ships its own `.gitignore` |

`.workflow/` is created on the first save. Projects with an existing Maestro knowledge base work as is.

### Usage

1. Install, grant the permissions, and chat in Agent mode; retrieval is automatic.
2. Say "remember: …", or let the Agent propose lessons at the end of a task.
3. On the card, pick an action per item and submit:
   - **Save as new**
   - **Replace X**: save the new entry; X becomes `deprecated` and points to it (its body is kept)
   - **Both hold alongside X**: save and link the two entries
   - **Duplicate of X** / **Do not save**: nothing is written
4. Closing or declining the card writes nothing; the proposal stays pending and can be handled in the **Review knowledge proposals** panel (global search).

### Agent tools

Exposed as `plugin_axc00_project_knowledge_<name>` and activated through ToolSearch; the plugin's system-prompt guidance tells the Agent how. Plugin tools are unavailable in Plan mode (automatic retrieval still works).

| Tool | Input | Effect |
|---|---|---|
| `search` | `query`, optional `type` (`knowhow`/`spec`), `limit` | IDs, titles, one-line summaries; no bodies; retired entries excluded |
| `load` | `id` | Full text of one entry, with a warning if it is retired |
| `propose` | `items[]`: `title`, `content`, `keywords` | Stores the proposal and returns the card arguments; writes no knowledge |

### Settings

| Setting | Default | Notes |
|---|---|---|
| Jev dedup | Off | TypeSafe or OpenRouter |
| Jev API key | empty | Empty: Jev is never called. **Stored in plain text in plugin settings** (PI-Desktop has no encrypted plugin settings yet) |
| Jev model | empty | Defaults to `jev-latest` (TypeSafe) or `typesafe/jev-1.13` (OpenRouter) |

Jev is only called when a proposal resembles existing entries. On failure or confidence below 0.7 the title/content rules decide, and the card says which source decided.

### Permissions and data flow

| Capability | Permission | Reads | Writes / sends | When |
|---|---|---|---|---|
| Search and load | `fs.read` (`.workflow/**`) | `.workflow/knowhow`, `.workflow/specs` | nothing | every message, `search`/`load` |
| Retrieval and guidance | `agent.extension` | same (read directly in the agent process) | appends entry IDs, titles and one-line summaries to messages sent to the model; appends fixed guidance to the system prompt | every model request |
| Store a proposal | `fs.write` (`.workflow/knowledge-inbox/**`) | — | `.workflow/knowledge-inbox/<id>.json` and `.gitignore` | `propose` |
| Save confirmed knowledge | `agent.extension`; panel path uses `fs.write` (`.workflow/knowhow/**`) | the stored proposal | new files in `.workflow/knowhow`; `status`/`supersededBy`/`related` of an old knowhow entry you chose to replace or link | **only after you answer the card or press Save in the panel** |
| Jev dedup (optional) | `net.fetch` (`api.typesafe.ai`, `openrouter.ai` only) | the key from plugin settings | sends proposed title/content/keywords and up to 3 similar existing entries (title and truncated body) | Jev enabled and similar entries exist |
| Fallback panel | `ui.panel` | stored proposals | same as saving | when you open it |
| Register tools | `agent.tool.register` | — | — | on load |

**About the agent extension**: `agent.extension` runs inside the agent process, outside the plugin file-permission gateway. It reads the knowledge base for automatic retrieval and performs the confirmed write from your real answer on the card (only the extension sees that answer). It therefore carries its own confined file access:

- **The project root is pinned when the session starts**: its real path and the directory's dev/ino are recorded. Before and after every read, list, write and remove, the working directory must still resolve to that same directory; a root renamed, replaced by a symlink or by another directory between operations is refused, content already read is discarded and a file already written is removed.
- Anchored on the pinned root, **a symbolic link at any path component is refused**, including the start directories `.workflow`, `.workflow/knowhow` and `.workflow/specs`; the result is then resolved with realpath and must stay inside the project. Opening the project through a symlinked path is allowed; links inside the project's content are not.
- Only singly linked regular files are read: **hard links** (which may point outside the project), FIFOs and other special files, and files over 256 KB are skipped; at most 2000 files are read per retrieval.
- Files are opened with `O_NOFOLLOW|O_NONBLOCK` (a FIFO cannot stall the turn) and the opened inode is compared with the checked path, so a swap between check and read is detected.
- Writes are limited to `.workflow/knowhow/` and `.workflow/knowledge-inbox/`, refusing absolute paths and `..`. Content goes to an `O_EXCL|O_NOFOLLOW` temp file in a directory whose canonical path is verified before and after writing, then is renamed within that directory.
- When retrieval is refused, the model only receives an "automatic retrieval failed" notice, never file content.

**About prompt injection**: entries come from repository authors and may contain hostile text. The attached block and `load` results label them as project data, not instructions, and the system-prompt guidance tells the model never to follow directives inside them; every attached field is clipped (title and summary to 120 characters) and stripped of angle brackets. When opening a repository of unknown origin, review its `.workflow/` first.

All of the above is covered by tests. The plugin runs no commands, contacts no network other than Jev, and has no third-party dependencies.

### Known limitations

- Retrieval is keyword based (Chinese bigrams, English words); put synonyms in `keywords` when saving.
- The card is shown by the host `asktool`, which the model must call with `propose`'s arguments unchanged; a reworded card saves nothing and the proposal stays in the panel.
- Requires PI-Desktop 0.15.9 or later (agent extensions, `before_provider_request`, `asktool`). End-to-end tested on Linux.
