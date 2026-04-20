# MEMORY.md - occ 长期记忆

## 项目概要
- **openclaw-code**：VS Code 插件项目
- **工作目录**：/Users/lw/ai/openclaw-code

## 技能
- **vsix-package**：打包技能，每次打包自动递增 patch 版本
  - 当前版本：0.1.1
  - 下次打包输出：0.1.2

## 角色与规则
- **occ**（我）：互联网技术专家，常驻 agent，负责代码开发和技术决策
- **来福**（主 agent）：不能直接改代码，必须让 occ 执行
- **AGENTS.md** 已精简

## 版本历史
| 版本 | 日期 | 备注 |
|------|------|------|
| 0.1.1 | 2026-04-14 | 当前版本 |
| 0.1.2 | 待定 | 下次打包 |

## 关键决策
- 多会话状态存储在工作区 `.openclaw/sessions.json`，按项目隔离
- Webview 会话 UI 的初始化必须在前端 `message` 监听器注册完成后再发送 `ready`
- `occ.chatView` 需要启用 `retainContextWhenHidden: true`，避免侧边栏切走再回来时下拉状态丢失
- 新会话名称采用首条用户消息自动摘要，旧会话名称不迁移，手动改名优先级最高
- Webview 中不再使用原生 `confirm`/`prompt` 做会话删除和重命名，统一改为扩展侧原生确认与输入框

## 工作目录规范

### 📁 openclaw-code 是标准 OpenClaw 工作区
- **路径**：`/Users/lw/ai/openclaw-code/`
- **性质**：occ agent 的工作目录，是标准的 OpenClaw 工作区
- **关键规则**：所有文件按 OpenClaw 约定摆放和加载
  - `MEMORY.md` → 工作区根目录（与 AGENTS.md、SOUL.md 同级）
  - `memory/YYYY-MM-DD.md` → 日记文件放子目录
  - 不要自己发明目录结构，遵循 OpenClaw 标准

### ⚠️ 教训
- 之前 MEMORY.md 被放在了 `memory/MEMORY.md`（子目录），违反了 OpenClaw 约定
- 已移至根目录 `/Users/lw/ai/openclaw-code/MEMORY.md`
- 以后涉及 occ 工作目录的操作，必须按 OpenClaw 标准来

### 🧠 身份确认
- 我是 **occ（码哥）**，不是来福
- 用户在 openclaw-code 上下文跟我对话时，我就是 occ
- 更新记忆文件时，更新的是 occ 工作目录下的文件，不是来福的

---
*最后更新：2026-04-18*

## Promoted From Short-Term Memory (2026-04-20)

<!-- openclaw-memory-promotion:memory:memory/2026-04-14.md:18:18 -->
- *记录时间：2026-04-14* [score=0.808 recalls=0 avg=0.620 source=memory/2026-04-14.md:18-18]
