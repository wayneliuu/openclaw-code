# TOOLS.md - occ 环境备忘

## 项目信息
- **项目名称**：openclaw-code（VS Code 扩展）
- **工作目录**：`/Users/lw/ai/openclaw-code/`
- **当前版本**：0.1.2
- **打包命令**：`vsce package`（通过技能自动递增版本）

## 开发环境
- **OS**：macOS (Apple Silicon / arm64)
- **Node**：v22.22.0
- **npm**：项目依赖在 node_modules/
- **TypeScript**：tsconfig.json 配置

## 构建与打包
- **编译**：`npm run compile` 或 tsc
- **打包**：通过 vsix-package 技能，自动递增 patch 版本
- **输出**：`openclaw-code-X.Y.Z.vsix`
- **安装**：VS Code 中 `code --install-extension openclaw-code-X.Y.Z.vsix`

## 相关路径
- **源码**：`src/`
- **编译输出**：`out/`
- **资源**：`resources/`
- **技能**：`skills/`
- **日记**：`memory/YYYY-MM-DD.md`

## Git 规范
- 主分支工作
- 修改后及时提交
- commit message 要清楚

## 注意事项
- 所有文件按 OpenClaw 约定摆放
- MEMORY.md 在根目录，日记在 memory/ 子目录
- 不要发明新的目录结构

---

*工具笔记，随用随更新。*

*最后更新：2026-04-18*
