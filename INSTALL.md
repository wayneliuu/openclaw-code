# OpenClaw Code (OCC) 安装指南

## 快速安装

### 方法 1: 通过 VSIX 安装（推荐）

1. **在 Windsurf 中安装**
   - 打开 Windsurf
   - 按 `Cmd+Shift+P` (macOS) 或 `Ctrl+Shift+P` (Windows/Linux)
   - 输入 "Install from VSIX"
   - 选择 `openclaw-code-0.1.0.vsix` 文件
   - 等待安装完成

2. **重启 Windsurf**
   - 安装完成后重启 Windsurf

3. **验证安装**
   - 在左侧活动栏应该能看到 OpenClaw 图标（三层堆叠图标）
   - 点击图标打开聊天面板

## 配置

### 1. 配置 OpenClaw Gateway Token

**必须配置 Token 才能使用！**

1. 打开 Windsurf 设置
   - macOS: `Cmd+,`
   - Windows/Linux: `Ctrl+,`

2. 搜索 "OpenClaw"

3. 找到 `OCC: Gateway Token` 设置

4. 输入您的 OpenClaw Gateway 认证 Token

### 2. 配置 Gateway URL（可选）

默认 URL 是 `http://127.0.0.1:18789`

如果您的 Gateway 运行在不同的地址，可以修改 `OCC: Gateway Url` 设置。

### 3. 开启 API 访问

如果需要通过外部应用调用 OpenClaw，需要开启 Chat Completions API：

```json
"gateway": {
  "http": {
    "endpoints": {
      "chatCompletions": {
        "enabled": true
      }
    }
  }
}
```

配置路径：`gateway.http.endpoints.chatCompletions.enabled`

## 使用方法

### 基础聊天

1. **打开聊天面板**
   - 点击左侧活动栏的 OpenClaw 图标

2. **发送消息**
   - 在底部输入框输入问题
   - 点击 "Send" 按钮或按 `Cmd+Enter` (macOS) / `Ctrl+Enter` (Windows/Linux)

3. **查看回复**
   - AI 回复会实时流式显示
   - 支持 Markdown 格式，包括代码高亮

### 包含代码上下文

1. **在编辑器中选中代码**
   - 打开任意代码文件
   - 选中您想要讨论的代码片段

2. **发送消息**
   - 切换到 OpenClaw 聊天面板
   - 输入您的问题
   - 发送时会自动包含选中的代码

### 清空聊天

- 点击 "Clear" 按钮清空所有消息

## 快捷键

- `Cmd+Enter` / `Ctrl+Enter`: 发送消息（在输入框中）

## 故障排除

### 1. 无法连接到 Gateway

**错误**: "HTTP 401" 或 "HTTP 403"

**解决方案**:
- 检查 Token 是否正确配置
- 确认 OpenClaw Gateway 正在运行
- 验证 Gateway URL 设置是否正确

### 2. Gateway 未运行

**错误**: "Failed to fetch" 或 "Network error"

**解决方案**:
- 启动 OpenClaw Gateway
- 确认 Gateway 运行在 `http://127.0.0.1:18789`
- 测试连接: `curl http://127.0.0.1:18789/v1/models`

### 3. 没有看到 OpenClaw 图标

**解决方案**:
- 重启 Windsurf
- 检查扩展是否已启用（扩展面板中搜索 "OpenClaw Code"）
- 查看开发者控制台是否有错误（Help > Toggle Developer Tools）

### 4. 消息发送后没有响应

**解决方案**:
- 检查 Token 配置
- 查看开发者控制台的错误信息
- 确认 Gateway 的 agent 配置正确

## 开发者信息

### 重新编译

```bash
cd openclaw-code
npm install
npm run compile
```

### 重新打包

```bash
npm run package
```

### 查看日志

打开 Windsurf 开发者工具：
- macOS: `Cmd+Option+I`
- Windows/Linux: `Ctrl+Shift+I`

## 版本信息

- **版本**: 0.1.0 (MVP)
- **发布日期**: 2026-04-14
- **兼容性**: VSCode >= 1.75.0, Windsurf

## 功能特性

✅ 基础聊天功能  
✅ 流式响应输出  
✅ 代码上下文自动包含  
✅ Markdown 渲染  
✅ 代码语法高亮  
✅ 简单配置管理  

## 后续版本计划

- [ ] 多会话管理
- [ ] Agent 选择
- [ ] 代码插入功能
- [ ] 右键菜单集成
- [ ] 会话历史持久化
- [ ] 更多快捷键

## 反馈

如有问题或建议，请联系开发团队。
