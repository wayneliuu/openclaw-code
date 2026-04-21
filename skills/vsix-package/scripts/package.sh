#!/bin/bash
# vsix-package 打包脚本
# 工作目录：/Users/lw/ai/openclaw-code
# 版本号唯一来源：package.json

set -e

WORKDIR="/Users/lw/ai/openclaw-code"
PKG_NAME="openclaw-code"

cd "$WORKDIR"

# 从 package.json 读取当前版本
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "📌 当前版本: $CURRENT_VERSION"

# 解析版本号
IFS='.' read -ra VER <<< "$CURRENT_VERSION"
MAJOR="${VER[0]}"
MINOR="${VER[1]}"
PATCH="${VER[2]}"

# 处理大版本升级指令（如 "升级到 0.2" 或 "升级到 1.0"）
UPGRADE_TO=""
if [[ "$1" == *升级* ]]; then
    UPGRADE_TO=$(echo "$1" | sed 's/升级到//' | tr -d ' ')
fi

if [ -n "$UPGRADE_TO" ]; then
    echo "🔝 检测到大版本升级指令: $UPGRADE_TO"
    IFS='.' read -ra TARGET_VER <<< "$UPGRADE_TO"
    MAJOR="${TARGET_VER[0]}"
    MINOR="${TARGET_VER[1]:-0}"
    PATCH="0"
    NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
else
    # 默认递增 patch 版本
    PATCH=$((PATCH + 1))
    NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
fi

# 更新 package.json 中的版本号
node -e "const pkg=require('./package.json'); pkg.version='$NEW_VERSION'; require('fs').writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');"
echo "✅ 版本已更新: $CURRENT_VERSION → $NEW_VERSION"

# 确保 vsce 可用
VSCMD="$(pwd)/node_modules/.bin/vsce"
if [ ! -x "$VSCMD" ]; then
    VSCMD="vsce"
fi

# 执行打包
echo "📦 开始打包..."
OUTPUT_FILE="${PKG_NAME}-${NEW_VERSION}.vsix"

# 清理旧包
rm -f "$WORKDIR"/*.vsix

"$VSCMD" package -o "$OUTPUT_FILE"

if [ -f "$WORKDIR/$OUTPUT_FILE" ]; then
    SIZE=$(ls -lh "$WORKDIR/$OUTPUT_FILE" | awk '{print $5}')
    echo ""
    echo "🎉 打包完成！"
    echo "   文件: $OUTPUT_FILE"
    echo "   大小: $SIZE"
else
    echo "❌ 打包失败"
    exit 1
fi
