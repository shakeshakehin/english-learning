#!/bin/bash
# 一键发布：同步内容 → 生成站点数据 → git 推送 → GitHub Actions 自动更新网站
set -e
VAULT="/c/Users/Administrator/Documents/Obsidian Vault"
cd "$VAULT"

# 1. 同步内容到构建目录
rm -rf "site/docs/Articles" "site/docs/Languages"
cp -r "$VAULT/Articles" "site/docs/Articles"
[ -d "$VAULT/Languages" ] && cp -r "$VAULT/Languages" "site/docs/Languages"

# 2. 生成 articles.json / wordDB.json / index.md，复制前端资源
python "$(cygpath -w "$VAULT/site/build.py")"

# 3. 推送
git add -A
git commit -m "site update $(date +%Y-%m-%d)" || echo "(no changes to commit)"
git push
echo "=== 已推送，网站约 1-2 分钟后自动更新 ==="
