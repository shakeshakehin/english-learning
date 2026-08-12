# -*- coding: utf-8 -*-
"""自动抓取 + 发布（GitHub Actions 定时运行，本地亦可跑）
流程：读 crawl-config.json -> WordPress REST API 拉文章列表 -> 按偏好过滤去重 ->
抓正文清洗 -> 生成 Articles/*.md -> 构建站点 -> git commit + push（触发 Pages 部署）
"""
import datetime
import html as H
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

import requests

REPO = os.path.dirname(os.path.abspath(__file__))
ARTICLES = os.path.join(REPO, "Articles")
STATE_FILE = os.path.join(REPO, "crawl-state.json")
UA = {"User-Agent": "Mozilla/5.0 (English-Learning-Site/1.0; +https://shakeshakehin.github.io/english-learning/)"}
_SESSION = requests.Session()
_SESSION.headers.update(UA)


def fetch(url):
    r = _SESSION.get(url, timeout=40)
    r.raise_for_status()
    return r.text


def load_state():
    try:
        return json.load(open(STATE_FILE, encoding="utf-8"))
    except Exception:
        return {}


def save_state(state):
    json.dump(state, open(STATE_FILE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def load_config():
    return json.load(open(os.path.join(REPO, "crawl-config.json"), encoding="utf-8"))


def match_topics(topics, title, body):
    if not topics:
        return []
    hay = (title + " " + body[:3000]).lower()
    return [t for t in topics if t.lower() in hay]


def list_posts(src, since):
    """增量拉文章列表（字段瘦身：仅 title/date/link；since 后仅拉新文章）"""
    base = src["url"].rstrip("/")
    params = "per_page=20&_fields=title,date,link"
    if since:
        params += "&after=" + urllib.parse.quote(since + "T00:00:00")
    try:
        data = json.loads(fetch(base + "/wp-json/wp/v2/posts?" + params))
    except Exception:
        return []  # 单源失败不中断整体
    posts = []
    for p in data:
        title = H.unescape(re.sub(r"<[^>]+>", "", p["title"]["rendered"])).strip()
        if not title:
            continue
        posts.append({"title": title, "date": p["date"][:10], "link": p["link"]})
    return posts


def fetch_content(src, link):
    """按需拉单篇正文（仅候选文章）"""
    slug = link.rstrip("/").split("/")[-1]
    url = src["url"].rstrip("/") + "/wp-json/wp/v2/posts?slug=" + urllib.parse.quote(slug) + "&_fields=content"
    try:
        data = json.loads(fetch(url))
    except Exception:
        return ""
    return data[0]["content"]["rendered"] if data else ""


def clean_content(raw_html):
    """清洗 HTML 为 markdown 正文：保留段落/标题结构（<p>/<h2>/<h3>/<li>）。
    丢弃脚本/样式/图片/链接，保留可读文本，段落间用空行分隔。"""
    raw_html = re.sub(r"<script.*?</script>|<style.*?</style>", " ", raw_html, flags=re.S)
    # 移除图片（保留 alt 文本可有可无，这里丢弃以免噪音）
    raw_html = re.sub(r"<img[^>]*>", " ", raw_html, flags=re.I)
    # 块级元素转为换行分隔，便于按标签分段
    raw_html = re.sub(r"</p>|</h1>|</h2>|</h3>|</h4>|<br\s*/?>|</li>|</div>", "\n", raw_html, flags=re.I)
    # 列表项加 "- "
    raw_html = re.sub(r"<li[^>]*>", "- ", raw_html, flags=re.I)
    # 标题转 markdown 井号
    raw_html = re.sub(r"<h1[^>]*>", "## ", raw_html, flags=re.I)
    raw_html = re.sub(r"<h2[^>]*>", "## ", raw_html, flags=re.I)
    raw_html = re.sub(r"<h3[^>]*>", "### ", raw_html, flags=re.I)
    raw_html = re.sub(r"<h4[^>]*>", "#### ", raw_html, flags=re.I)
    # 剩余标签丢弃
    text = re.sub(r"<[^>]+>", "", raw_html)
    text = H.unescape(text)
    # 分段：按换行切块，块内合并空白
    blocks = []
    for blk in text.split("\n"):
        blk = re.sub(r"\s+", " ", blk).strip()
        if blk:
            blocks.append(blk)
    # 去掉导航/广告类残句
    drop = ["National DevOps Awards", "Learn more here", "Subscribe to our newsletter",
            "Click here to", "Contact us", "Follow us on", "You may also like"]
    blocks = [b for b in blocks if not any(d in b for d in drop)]
    # 合并过短的块（非列表项、非标题）到上一段，避免碎片
    merged = []
    for b in blocks:
        is_keep = b.startswith(("#", "- "))
        if not merged or is_keep or len(b) > 140:
            merged.append(b)
        else:
            merged[-1] = merged[-1] + " " + b
    return "\n\n".join(merged)


def main():
    cfg = load_config()
    # 命令行关键词覆盖（--keyword pour over,brew）——对所有源生效
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--keyword", help="抓取关键词（逗号分隔），覆盖各源配置 topics")
    ap.add_argument("--min-words", type=int, help="覆盖最小字数")
    ap.add_argument("--max-words", type=int, help="覆盖最大字数")
    ap.add_argument("--no-push", action="store_true", help="抓取+构建但不 git push（仅本地预览）")
    args = ap.parse_args()
    kw_override = None
    if args.keyword:
        kw_override = [k.strip() for k in args.keyword.split(",") if k.strip()]
    min_words = args.min_words if args.min_words is not None else cfg.get("min_words", 250)
    max_words = args.max_words if args.max_words is not None else cfg.get("max_words", 5000)
    existing_slugs = set()
    existing_names = set()
    for fn in os.listdir(ARTICLES):
        if not fn.endswith(".md"):
            continue
        existing_names.add(fn[:-3].lower())
        try:
            raw = open(os.path.join(ARTICLES, fn), encoding="utf-8").read()
            m = re.search(r'^url:\s*"?([^"\n]+)"?', raw, re.M)
            if m:
                slug = m.group(1).rstrip("/").split("/")[-1].lower()
                existing_slugs.add(slug)
        except Exception:
            pass

    state = load_state()
    today = datetime.date.today().isoformat()
    added = []
    # 并行拉取各源文章列表（网络延迟重叠，整体提速）
    sources = cfg.get("sources", [])
    src_lists = {}
    with ThreadPoolExecutor(max_workers=4) as ex:
        future_map = {ex.submit(list_posts, s, state.get(s["url"])): s for s in sources}
        for f in future_map:
            src_lists[future_map[f]["url"]] = (future_map[f], f.result())
    for src in sources:
        if len(added) >= cfg.get("max_per_run", 3):
            break
        topics = kw_override if kw_override is not None else (src.get("topics") or [])
        src_label = src.get("label") or src["url"].split("//")[-1].rstrip("/")
        src_cats = src.get("categories") or {}
        fixed_cat = src.get("category")
        posts = src_lists.get(src["url"], ([], []))[1]
        for p in posts:
            if len(added) >= cfg.get("max_per_run", 3):
                break
            slug = p["link"].rstrip("/").split("/")[-1].lower()
            key = p["title"].lower()
            # 去重：URL slug 相同，或标题是已存在文件名子串
            if slug in existing_slugs or any(key in e for e in existing_names):
                continue
            # 标题层预过滤：标题不含关键词 → 跳过（不抓正文，省时间）
            if topics:
                tl = p["title"].lower()
                if not any(t.lower() in tl for t in topics):
                    continue
            content = fetch_content(src, p["link"])
            if not content:
                continue
            # 尊重源 robots.txt 的 crawl-delay
            delay = cfg.get("crawl_delay", 0) or src.get("crawl_delay", 0)
            if delay:
                time.sleep(delay)
            tags = match_topics(topics, p["title"], content)
            if topics and not tags:
                continue
            body = clean_content(content)
            words = len([w for w in body.split() if re.search(r"[A-Za-z]", w)])
            if words < min_words or words > max_words:
                continue
            # 文件名：清理非法字符 + 特殊引号/破折号（防 MkDocs URL 异常）
            fn_title = p["title"]
            fn_title = fn_title.replace("\u201c", "").replace("\u201d", "").replace("\u2018", "").replace("\u2019", "")
            fn_title = fn_title.replace("\u2013", "-").replace("\u2014", "-").replace("\u2212", "-")
            fn_title = fn_title.replace("\u00a0", " ").replace("\u00ae", "")
            fn = re.sub(r'[\\/:*?"<>|]', "-", f"{p['date']} {fn_title}.md")
            fn = re.sub(r"\s+", " ", fn).strip()
            # 分类：源固定分类优先，否则关键词映射，否则 General
            category = fixed_cat or "General"
            if not fixed_cat:
                for t in tags:
                    if t.lower() in src_cats:
                        category = src_cats[t.lower()]
                        break
            front = (
                f'---\ntitle: "{p["title"]}"\nsource: "{src_label}"\n'
                f'url: "{p["link"]}"\npublished: {p["date"]}\n'
                f'added: {datetime.date.today().isoformat()}\n'
                f'category: "{category}"\ntags: {json.dumps(tags, ensure_ascii=False)}\n'
                f'type: article\n---\n\n# {p["title"]}\n\n{body}\n'
            )
            open(os.path.join(ARTICLES, fn), "w", encoding="utf-8").write(front)
            existing_slugs.add(slug)
            existing_names.add(fn[:-3].lower())
            added.append((fn, words))
            print("ADDED:", fn, f"({words} words)")
        # 该源处理完：记录增量游标（下次只拉今天之后的新文章）
        state[src["url"]] = today
    save_state(state)

    if not added:
        print("no new articles")
    else:
        print(f"added {len(added)} article(s)")
    return args.no_push


if __name__ == "__main__":
    no_push = main()
    # 构建站点（articles.json / wordDB.json / index.md / assets）—— 始终构建，便于前端资源更新上线
    subprocess.run([sys.executable, os.path.join(REPO, "site", "build.py")], check=True)
    if no_push:
        print("--no-push：已抓取+构建，未推送")
        raise SystemExit(0)
    subprocess.run(["git", "add", "-A"], check=True)
    subprocess.run(["git", "commit", "-m",
                    f"auto-crawl {datetime.date.today().isoformat()}"], check=True)
    # 推送：Actions 内用 GITHUB_TOKEN，本地用默认凭据
    token = os.environ.get("GH_TOKEN")
    if token:
        repo_full = os.environ.get("GITHUB_REPOSITORY", "")
        url = f"https://x-access-token:{token}@github.com/{repo_full}.git"
        subprocess.run(["git", "push", url, "HEAD:main"], check=True)
    else:
        subprocess.run(["git", "push"], check=True)
    print("pushed -> Pages 自动部署")
