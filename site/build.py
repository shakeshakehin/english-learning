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

SITE = os.path.dirname(os.path.abspath(__file__))  # 本脚本所在目录 = site/
VAULT = os.path.dirname(SITE)  # 仓库根（本地=vault 根，云端=checkout 目录）
DOCS = os.path.join(SITE, "docs")
ARTICLES = os.path.join(VAULT, "Articles")
LANGUAGES = os.path.join(VAULT, "Languages")
REPO = VAULT


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
    """解析 wordDB.md 表格 -> wordDB.json；也兼容 `- word: 释义` 列表。
    若存在 Languages/cambridge_cache.json（剑桥抓取缓存），用它覆盖释义作为权威来源。"""
    path = os.path.join(LANGUAGES, "wordDB.md")
    cache_path = os.path.join(LANGUAGES, "cambridge_cache.json")
    cache = {}
    if os.path.exists(cache_path):
        try:
            cache = json.load(open(cache_path, encoding="utf-8"))
        except Exception:
            cache = {}
    if not os.path.exists(path):
        # 即便无 wordDB.md，也尽量用剑桥缓存产出
        words = [{"word": w, "meaning": v.get("meaning") or v.get("def_en") or ""}
                 for w, v in cache.items() if v]
        json.dump(words, open(os.path.join(DOCS, "wordDB.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"wordDB.json: {len(words)} words (from cambridge cache)")
        return words
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
    # 剑桥缓存覆盖释义（权威词典级）
    merged = []
    covered = set()
    for w in words:
        c = cache.get(w["word"])
        if c and (c.get("meaning") or c.get("def_en")):
            merged.append({"word": w["word"], "meaning": c.get("meaning") or c.get("def_en") or w["meaning"],
                           "pos": c.get("pos", ""), "def_en": c.get("def_en", "")})
            covered.add(w["word"])
        else:
            merged.append({"word": w["word"], "meaning": w["meaning"]})
    # 剑桥缓存里有但 wordDB 没有的词也补进去
    for w, c in cache.items():
        if c and (c.get("meaning") or c.get("def_en")) and w not in covered:
            merged.append({"word": w, "meaning": c.get("meaning") or c.get("def_en") or "",
                           "pos": c.get("pos", ""), "def_en": c.get("def_en", "")})
    json.dump(merged, open(os.path.join(DOCS, "wordDB.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"wordDB.json: {len(merged)} words (cambridge covered {len(covered)})")
    return merged


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
    ]
    # 自动抓取偏好展示（读仓库根 crawl-config.json）
    crawl_cfg = os.path.join(REPO, "crawl-config.json")
    if os.path.exists(crawl_cfg):
        try:
            c = json.load(open(crawl_cfg, encoding="utf-8"))
            topics = c.get("topics") or []
            srcs = [s.split("//")[-1].rstrip("/") for s in c.get("sources", [])]
            lines += [
                "> **自动抓取配置**：" + ("；".join(srcs)) +
                ("（主题：" + "、".join(topics) + "）" if topics else "（全部主题）") +
                f"，{c.get('min_words', 200)}–{c.get('max_words', 5000)} 词，每次最多 {c.get('max_per_run', 3)} 篇。每天自动更新。",
                "",
            ]
        except Exception:
            pass
    lines += [
        '<div id="article-filter">',
        '  <input id="f-search" type="text" placeholder="输入关键词实时筛选（如 ai / automation / 测试）">',
        '  <input id="f-min" type="number" placeholder="最少字数" min="0">',
        '  <input id="f-max" type="number" placeholder="最多字数" min="0">',
        '  <button id="f-clear">重置</button>',
        "</div>",
        "",
        '<div id="crawl-console">',
        '  <h4>抓取新文章（按主题 + 字数）</h4>',
        '  <div class="crawl-row">',
        '    <input id="crawl-kw" type="text" placeholder="输入主题关键词，如 ai, automation, coffee">',
        '    <input id="crawl-min" type="number" placeholder="最少字数" min="0">',
        '    <input id="crawl-max" type="number" placeholder="最多字数" min="0">',
        '    <button id="crawl-copy">复制抓取命令</button>',
        '    <a id="crawl-github" href="https://github.com/shakeshakehin/english-learning/actions/workflows/crawl.yml" target="_blank" rel="noopener">GitHub 手动触发</a>',
        "  </div>",
        '  <p id="crawl-match">输入主题关键词可实时筛选已有文章（上面列表），并生成抓取命令。</p>',
        '  <p class="crawl-cmd">命令：<code id="crawl-cmd">python crawl_and_build.py（默认配置）</code></p>',
        '  <p class="crawl-hint"><b>说明：</b>本站是纯静态页，浏览器无法直接运行抓取脚本，所以「筛选」用来<br>① 看已有文章里有没有你想要的；② 帮你生成对应的抓取命令。<br>真正抓取需三选一：① 本机 vault 目录运行上面的命令（或让我抓）；② 点「GitHub 手动触发」在 Actions 里填关键词/字数运行；③ 每天 06:00 自动按配置抓取。抓取后约 1-2 分钟网页更新。</p>',
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
