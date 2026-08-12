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
    text = re.sub(r"<script.*?</script>|<style.*?</style>", " ", raw_html, flags=re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = H.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    for marker in ["National DevOps Awards", "Learn more here", "Subscribe to our newsletter",
                   "Click here to", "Contact us", "Follow us on"]:
        text = text.replace(marker, " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def main():
    cfg = load_config()
    # 命令行关键词覆盖（--keyword pour over,brew）——对所有源生效
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--keyword", help="抓取关键词（逗号分隔），覆盖各源配置 topics")
    args = ap.parse_args()
    kw_override = None
    if args.keyword:
        kw_override = [k.strip() for k in args.keyword.split(",") if k.strip()]
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
            tags = match_topics(topics, p["title"], content)
            if topics and not tags:
                continue
            body = clean_content(content)
            words = len([w for w in body.split() if re.search(r"[A-Za-z]", w)])
            if words < cfg.get("min_words", 250) or words > cfg.get("max_words", 5000):
                continue
            fn = re.sub(r'[\\/:*?"<>|]', "-", f"{p['date']} {p['title']}.md").replace("\xa0", " ")
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
        return
    print(f"added {len(added)} article(s)")


if __name__ == "__main__":
    main()
    # 构建站点（articles.json / wordDB.json / index.md / assets）
    subprocess.run([sys.executable, os.path.join(REPO, "site", "build.py")], check=True)
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
