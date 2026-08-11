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
import urllib.request

REPO = os.path.dirname(os.path.abspath(__file__))
ARTICLES = os.path.join(REPO, "Articles")
UA = {"User-Agent": "Mozilla/5.0 (English-Learning-Site/1.0; +https://shakeshakehin.github.io/english-learning/)"}


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", "ignore")


def load_config():
    return json.load(open(os.path.join(REPO, "crawl-config.json"), encoding="utf-8"))


def list_posts(cfg):
    """WordPress REST API 拉最新文章（标题/日期/链接/正文）"""
    base = cfg["sources"][0].rstrip("/")
    data = json.loads(fetch(base + "/wp-json/wp/v2/posts?per_page=20"))
    posts = []
    for p in data:
        title = re.sub(r"<[^>]+>", "", p["title"]["rendered"]).strip()
        if not title:
            continue
        posts.append({
            "title": title,
            "date": p["date"][:10],
            "link": p["link"],
            "content": p["content"]["rendered"],
        })
    return posts


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


def match_topics(cfg, title, body):
    topics = cfg.get("topics") or []
    if not topics:
        return []
    hay = (title + " " + body[:3000]).lower()
    return [t for t in topics if t.lower() in hay]


def main():
    cfg = load_config()
    posts = list_posts(cfg)
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

    added = []
    for p in posts:
        if len(added) >= cfg.get("max_per_run", 3):
            break
        slug = p["link"].rstrip("/").split("/")[-1].lower()
        key = p["title"].lower()
        # 去重：URL slug 相同，或标题是已存在文件名子串
        if slug in existing_slugs or any(key in e for e in existing_names):
            continue
        tags = match_topics(cfg, p["title"], p["content"])
        if cfg.get("topics") and not tags:
            continue
        body = clean_content(p["content"])
        words = len([w for w in body.split() if re.search(r"[A-Za-z]", w)])
        if words < cfg.get("min_words", 250) or words > cfg.get("max_words", 5000):
            continue
        fn = re.sub(r'[\\/:*?"<>|]', "-", f"{p['date']} {p['title']}.md")
        category = (tags[0].capitalize() if tags else "General")
        front = (
            f'---\ntitle: "{p["title"]}"\nsource: "Software Testing News"\n'
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
