#!/bin/bash
# 一键发布：同步内容到 site/docs → 生成首页 → git 推送 → GitHub Actions 自动更新网站
set -e
VAULT="/c/Users/Administrator/Documents/Obsidian Vault"
SITE="$VAULT/site"
cd "$VAULT"

mkdir -p "$SITE/docs"
rm -rf "$SITE/docs/Articles" "$SITE/docs/Languages"
cp -r "$VAULT/Articles" "$SITE/docs/Articles"
[ -d "$VAULT/Languages" ] && cp -r "$VAULT/Languages" "$SITE/docs/Languages"

# 生成首页：文章列表 + 词库入口
python - "$(cygpath -w "$SITE")" << 'EOF'
import os, sys, datetime
site = sys.argv[1]
docs = os.path.join(site, 'docs')
arts = sorted(os.listdir(os.path.join(docs, 'Articles')), reverse=True)
lines = ['# English Learning', '', '软件测试行业英语学习笔记。', '']
lines.append('## 文章')
for a in arts:
    base = a[:-3] if a.endswith('.md') else a
    lines.append(f'- [{base}](Articles/{base})')
if os.path.isdir(os.path.join(docs, 'Languages')):
    lines.append('')
    lines.append('## 词库')
    for f in sorted(os.listdir(os.path.join(docs, 'Languages'))):
        base = f[:-3] if f.endswith('.md') else f
        lines.append(f'- [{base}](Languages/{base})')
lines.append('')
lines.append(f'*最后更新: {datetime.date.today().isoformat()}*')
open(os.path.join(docs, 'index.md'), 'w', encoding='utf-8').write('\n'.join(lines))
print('index.md generated,', len(arts), 'articles')
EOF

git add -A
git commit -m "site update $(date +%Y-%m-%d)" || echo "(no changes to commit)"
git push
echo "=== 已推送，网站约 1-2 分钟后自动更新 ==="
