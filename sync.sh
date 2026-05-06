#!/bin/bash
# folder-card-view 同步脚本
# 1. 构建插件
# 2. 复制到 Obsidian vault
# 3. 提交并推送到 GitHub
# 用法: ./sync.sh [commit message]

set -e

VAULT_PLUGIN_DIR="$HOME/obs-note/youdaonote/.obsidian/plugins/folder-card-view"
COMMIT_MSG="${1:-update plugin}"

echo "=== 构建插件 ==="
npm run build

echo ""
echo "=== 同步文件到 vault ==="
cp -v main.js main.ts styles.css manifest.json versions.json "$VAULT_PLUGIN_DIR/"

echo ""
echo "=== 提交到 Git ==="
git add main.js main.ts styles.css manifest.json versions.json CLAUDE.md sync.sh package.json package-lock.json tsconfig.json
git diff --cached --stat
git commit -m "$COMMIT_MSG"

echo ""
echo "=== 推送到远程 ==="
git push

echo ""
echo "=== 全部完成 ==="
echo "Obsidian 中重新加载插件即可生效"
