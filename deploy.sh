#!/bin/bash
# 一键发布：同步内容 → 生成站点数据 → git 推送 → GitHub Actions 自动更新网站
set -e
VAULT="/c/Users/Administrator/Documents/Obsidian Vault"
cd "$VAULT"

# 1. 同步内容到构建目录
rm -rf "site/docs/Articles" "site/docs/Languages"
cp -r "$VAULT/Articles" "site/docs/Articles"
# Languages 只保留构建缓存（cambridge_cache.json），不复制 wordDB.md——生词表统一由 Vocab 页展示，
# wordDB.md 只是生词数据源，不应被 MkDocs 渲染成独立页面
[ -d "$VAULT/Languages" ] && mkdir -p "site/docs/Languages" && [ -f "$VAULT/Languages/cambridge_cache.json" ] && cp "$VAULT/Languages/cambridge_cache.json" "site/docs/Languages/cambridge_cache.json"

# 2. 生成 articles.json / wordDB.json / index.md，复制前端资源
python "$(cygpath -w "$VAULT/site/build.py")"

# 3. 拉取云端自动抓取的新文章，再推送本地改动
git pull --rebase --autostash 2>/dev/null || echo "(pull skipped)"
git add -A
git commit -m "site update $(date +%Y-%m-%d)" || echo "(no changes to commit)"
git push
echo "=== 已推送，网站约 1-2 分钟后自动更新 ==="
