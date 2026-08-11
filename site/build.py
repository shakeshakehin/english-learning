# -*- coding: utf-8 -*-
"""站点内容处理（由 deploy.sh 调用）：
1. 解析 Articles/*.md frontmatter -> docs/articles.json（类型/主题/字数/链接）
2. 解析 Languages/wordDB.md 表格 -> docs/wordDB.json（生词表）
3. 复制 site/assets/* -> docs/assets/（前端 JS/CSS）
4. 生成 docs/index.md（含筛选组件容器）
"""
import json
import os
import re
import shutil
from datetime import date

VAULT = r"C:\Users\Administrator\Documents\Obsidian Vault"
SITE = os.path.join(VAULT, "site")
DOCS = os.path.join(SITE, "docs")
ARTICLES = os.path.join(VAULT, "Articles")
LANGUAGES = os.path.join(VAULT, "Languages")


def parse_frontmatter(text):
    """简易 frontmatter 解析（--- 块内 key: value）"""
    fm = {}
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.S)
    if not m:
        return fm, text
    for line in m.group(1).splitlines():
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        k = k.strip().lower()
        v = v.strip().strip('"\'')
        if v.startswith("[") and v.endswith("]"):
            v = [x.strip().strip('"\'') for x in v[1:-1].split(",") if x.strip()]
        fm[k] = v
    return fm, text[m.end():]


def build_articles_json():
    articles = []
    for fn in sorted(os.listdir(ARTICLES)):
        if not fn.endswith(".md"):
            continue
        path = os.path.join(ARTICLES, fn)
        raw = open(path, encoding="utf-8").read()
        fm, body = parse_frontmatter(raw)
        words = len([w for w in body.split() if re.search(r"[A-Za-z]", w)])
        url = "Articles/" + fn[:-3].replace(" ", "%20") + "/"
        articles.append({
            "title": fm.get("title", fn[:-3]),
            "category": fm.get("category", fm.get("type", "未分类")),
            "tags": fm.get("tags", []),
            "published": fm.get("published", ""),
            "words": words,
            "url": url,
        })
    articles.sort(key=lambda a: a["published"], reverse=True)
    out = os.path.join(DOCS, "articles.json")
    json.dump(articles, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"articles.json: {len(articles)} articles")
    return articles


def build_worddb_json():
    """解析 wordDB.md 表格 -> wordDB.json；也兼容 `- word: 释义` 列表"""
    path = os.path.join(LANGUAGES, "wordDB.md")
    if not os.path.exists(path):
        json.dump([], open(os.path.join(DOCS, "wordDB.json"), "w", encoding="utf-8"))
        print("wordDB.json: 0 (no wordDB.md)")
        return []
    words = []
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line:
            continue
        w = meaning = None
        if line.startswith("|"):
            # 表格行: | word | meaning |
            cells = [c.strip() for c in line.strip("|").split("|")]
            if len(cells) >= 2 and cells[0]:
                w, meaning = cells[0], cells[1]
        else:
            m = re.match(r"^([a-zA-Z][a-zA-Z'\-]*)\s*[:：|]\s*(.+)$", line)
            if m:
                w, meaning = m.group(1), m.group(2)
        if w and meaning:
            w = w.strip().lower()
            meaning = meaning.strip()
            if re.fullmatch(r"[a-z][a-z'\-]*", w) and meaning:
                words.append({"word": w, "meaning": meaning})
    # 去重（保留首个）
    seen = set()
    words = [w for w in words if not (w["word"] in seen or seen.add(w["word"]))]
    json.dump(words, open(os.path.join(DOCS, "wordDB.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"wordDB.json: {len(words)} words")
    return words


def copy_assets():
    src = os.path.join(SITE, "assets")
    dst = os.path.join(DOCS, "assets")
    os.makedirs(dst, exist_ok=True)
    for fn in os.listdir(src):
        shutil.copy2(os.path.join(src, fn), os.path.join(dst, fn))
    print("assets copied:", os.listdir(src))


def build_index(articles):
    index = os.path.join(DOCS, "index.md")
    lines = [
        "# English Learning",
        "",
        "软件测试行业英语学习笔记。",
        "",
        '<div id="article-filter">',
        '  <select id="f-category"><option value="">全部类型</option></select>',
        '  <select id="f-topic"><option value="">全部主题</option></select>',
        '  <input id="f-min" type="number" placeholder="最少字数" min="0">',
        '  <input id="f-max" type="number" placeholder="最多字数" min="0">',
        '  <button id="f-clear">重置</button>',
        "</div>",
        "",
        '<div id="article-list"><p>加载中…</p></div>',
        "",
        f"*最后更新: {date.today().isoformat()}*",
        "",
    ]
    open(index, "w", encoding="utf-8").write("\n".join(lines))
    print("index.md generated")


if __name__ == "__main__":
    articles = build_articles_json()
    build_worddb_json()
    copy_assets()
    build_index(articles)
    print("build.py done")
