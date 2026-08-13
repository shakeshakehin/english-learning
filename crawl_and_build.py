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
from email.utils import parsedate_to_datetime

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
    """增量拉文章列表（字段瘦身：仅 title/date/link；since 后仅拉新文章）
    支持两种源类型：
      - WordPress REST API（默认）
      - RSS/Atom feed（src["type"] == "rss"，如 Guardian/报刊 op-ed）
    """
    if src.get("type") == "rss":
        return list_posts_rss(src, since)
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


def list_posts_rss(src, since):
    """RSS/Atom 源：解析 feed 标题/链接/日期，since 后仅拉新文章"""
    feed_url = (src.get("feed") or src.get("rss") or src["url"]).rstrip("/")
    try:
        data = fetch(feed_url)
    except Exception:
        return []
    import xml.etree.ElementTree as ET
    try:
        root = ET.fromstring(data)
    except ET.ParseError:
        return []
    posts = []
    # RSS 2.0: channel/item；Atom: feed/entry（用 local-name 判定，兼容两种）
    def local(tag):
        return tag.rsplit("}", 1)[-1]
    items = []
    for el in root.iter():
        if local(el.tag) in ("item", "entry"):
            items.append(el)
    for item in items:
        title = link = date = ""
        for child in item.iter():
            ln = local(child.tag)
            if ln == "title" and not title:
                title = (child.text or "").strip()
            elif ln == "link" and not link:
                link = (child.text or "").strip() or child.get("href", "")
            elif ln in ("pubDate", "published", "updated") and not date:
                date = (child.text or "").strip()
        title = H.unescape(re.sub(r"<[^>]+>", "", title)).strip()
        if not title or not link:
            continue
        if date:
            try:
                date = parsedate_to_datetime(date).date().isoformat()
            except Exception:
                date = date[:10]
        if since and date and date < since:
            continue
        posts.append({"title": title, "date": date or "", "link": link})
    return posts


def fetch_content(src, link):
    """按需拉单篇正文（仅候选文章）
    RSS 源：抓 HTML 页提取正文段落；WordPress 源：走 REST API
    """
    if src.get("type") == "rss":
        return fetch_content_html(link)
    slug = link.rstrip("/").split("/")[-1]
    url = src["url"].rstrip("/") + "/wp-json/wp/v2/posts?slug=" + urllib.parse.quote(slug) + "&_fields=content"
    try:
        data = json.loads(fetch(url))
    except Exception:
        return ""
    return data[0]["content"]["rendered"] if data else ""


def fetch_content_html(link):
    """抓普通 HTML 页面正文：提取 <p>/<h2>/<h3>/<li> 段落骨架，
    返回 HTML 片段交给 clean_content 统一清洗（保留段落结构）。
    选择器逐个尝试：Guardian 正文容器 data-gu-name="body" -> 通用 <article>/main 容器 -> 全页 <p>。
    """
    try:
        html = fetch(link)
    except Exception:
        return ""
    if not html:
        return ""
    container = None
    m = re.search(r'<div[^>]*data-gu-name="body"[^>]*>(.*?)</div>\s*(?:<div|</article|</main)', html, re.S)
    if not m:
        m = re.search(r'<article[^>]*>(.*?)</article>', html, re.S)
    if not m:
        m = re.search(r'<main[^>]*>(.*?)</main>', html, re.S)
    if m:
        container = m.group(1)
    scope = container if container else html
    # 提取段落骨架（丢弃脚本/样式/iframe/表单）
    scope = re.sub(r"<script.*?</script>|<style.*?</style>|<iframe.*?</iframe>|<form.*?</form>", " ", scope, flags=re.S)
    kept = []
    for mm in re.finditer(r"<(p|h2|h3|h4|li)[^>]*>.*?</\1>", scope, flags=re.S | re.I):
        if re.sub(r"<[^>]+>", "", mm.group(0)).strip():
            kept.append(mm.group(0))
    if not kept:
        return ""
    return "\n".join(kept)


def clean_content(raw_html):
    """清洗 HTML 为 markdown 正文：保留段落/标题结构（<p>/<h2>/<h3>/<li>）。
    丢弃脚本/样式/图片/链接；段落间用空行分隔，真段界（</p>/</h1-4>/</li>）与
    行内折行（<br>）区分对待，避免吞并独立短段落。"""
    raw_html = re.sub(r"<script.*?</script>|<style.*?</style>", " ", raw_html, flags=re.S)
    raw_html = re.sub(r"<img[^>]*>", " ", raw_html, flags=re.I)
    # 真段界 -> 双换行；行内折行 <br> -> 单空格（同段）
    raw_html = re.sub(r"</p>|</h1>|</h2>|</h3>|</h4>|</li>|</div>", "\n\n", raw_html, flags=re.I)
    raw_html = re.sub(r"<br\s*/?>", " ", raw_html, flags=re.I)
    raw_html = re.sub(r"<li[^>]*>", "- ", raw_html, flags=re.I)
    raw_html = re.sub(r"<h1[^>]*>|<h2[^>]*>", "## ", raw_html, flags=re.I)
    raw_html = re.sub(r"<h3[^>]*>", "### ", raw_html, flags=re.I)
    raw_html = re.sub(r"<h4[^>]*>", "#### ", raw_html, flags=re.I)
    text = re.sub(r"<[^>]+>", "", raw_html)
    text = H.unescape(text)
    # 按真段界切块，块内合并空白
    blocks = []
    for blk in text.split("\n\n"):
        blk = re.sub(r"\s+", " ", blk).strip()
        if blk:
            blocks.append(blk)
    # 去掉导航/广告类残句
    drop = ["National DevOps Awards", "Learn more here", "Subscribe to our newsletter",
            "Click here to", "Contact us", "Follow us on", "You may also like",
            "View image in fullscreen", "Skip to main content", "Sign in", "Sign up",
            "Most viewed", "Explore more on these topics", "Topics", "Newsletters",
            "Do you have an opinion on the issues raised"]
    blocks = [b for b in blocks if not any(d in b for d in drop)]
    # 只合并"上一块未以句末标点结尾的碎片"：短且像是行内折行残留才并入，
    # 独立短句（以 .!?;: 结尾）保留为独立段，符合"按段落切小片"
    merged = []
    for b in blocks:
        if (merged and not merged[-1].startswith(("#", "- "))
                and not re.search(r"[.!?;:]\s*$", merged[-1])
                and len(b) < 120):
            merged[-1] = merged[-1] + " " + b
        else:
            merged.append(b)
    return "\n\n".join(merged)


def summarize_takeaways(title, body):
    """抽取式 Key takeaways：从正文按"含高频词/含数字/句首"选出 2-3 句精简要点。
    非 LLM 兜底（GitHub Actions 无模型），质量有限；本地可人工/LLM 精修。"""
    import collections
    paras = [b.strip() for b in body.split("\n\n") if b.strip() and not b.startswith(("#", "-", ">"))]
    if not paras:
        return ["（自动摘要失败，请人工补充）"]
    text = " ".join(paras)
    sentences = re.split(r"(?<=[.!?])\s+", text)
    sentences = [s.strip() for s in sentences if len(s.split()) >= 6 and len(s.split()) <= 45]
    if not sentences:
        return [paras[0][:200]]
    # 词频统计（去掉停用词后的内容词）
    stop = set(("the","a","an","and","or","but","of","to","in","on","for","with","as","is","are","was","were","it","its","this","that","these","those","from","by","at","be","been","being","will","would","can","could","may","might","their","they","we","you","he","she","his","her","not","no","has","have","had","which","who","whom","about","into","than","also","more","most","new"))
    freq = collections.Counter()
    for w in re.findall(r"[A-Za-z][A-Za-z'\-]*", text.lower()):
        if w not in stop and len(w) > 3:
            freq[w] += 1
    def score(s):
        words = [w.lower() for w in re.findall(r"[A-Za-z][A-Za-z'\-]*", s) if w.lower() not in stop]
        return sum(freq[w] for w in words) / max(1, len(words))
    ranked = sorted(sentences, key=score, reverse=True)
    picks = ranked[:2]
    # 至少一条来自文章开头（更接近主题句）
    if sentences and sentences[0] not in picks:
        picks.append(sentences[0])
    return list(dict.fromkeys(picks))


def main():
    cfg = load_config()
    # 命令行关键词覆盖（--keyword pour over,brew）——对所有源生效
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--keyword", help="抓取关键词（逗号分隔），覆盖各源配置 topics")
    ap.add_argument("--min-words", type=str, help="覆盖最小字数（空串按默认）")
    ap.add_argument("--max-words", type=str, help="覆盖最大字数（空串按默认）")
    ap.add_argument("--no-push", action="store_true", help="抓取+构建但不 git push（仅本地预览）")
    args = ap.parse_args()
    kw_override = None
    if args.keyword:
        kw_override = [k.strip() for k in args.keyword.split(",") if k.strip()]
    # GitHub Actions 可能传入空字符串（--min-words ""），此时按默认处理
    def _words(v, default):
        if v is None or str(v).strip() == "":
            return default
        try:
            return int(v)
        except (TypeError, ValueError):
            return default
    min_words = _words(args.min_words, cfg.get("min_words", 250))
    max_words = _words(args.max_words, cfg.get("max_words", 5000))
    existing_slugs = set()
    existing_names = set()
    for root, _dirs, files in os.walk(ARTICLES):
        for fn in files:
            if not fn.endswith(".md"):
                continue
            existing_names.add(fn[:-3].lower())
            try:
                raw = open(os.path.join(root, fn), encoding="utf-8").read()
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
        future_map = {ex.submit(list_posts, s, state.get(s.get("feed") or s["url"])): s for s in sources}
        for f, src in future_map.items():
            src_lists[src.get("feed") or src["url"]] = (src, f.result())
    for src in sources:
        topics = kw_override if kw_override is not None else (src.get("topics") or [])
        src_label = src.get("label") or src["url"].split("//")[-1].rstrip("/")
        src_cats = src.get("categories") or {}
        fixed_cat = src.get("category")
        posts = src_lists.get(src.get("feed") or src["url"], (None, []))[1]
        # 每源独立额度（源配置 max_per_run 优先，否则全局值）——全局共享会导致
        # 排在后面的源（如 RSS op-ed）永远分不到名额
        src_max = src.get("max_per_run", cfg.get("max_per_run", 3))
        added_src = 0
        for p in posts:
            if added_src >= src_max:
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
            # 保存路径：源配置 subdir 时 -> Articles/<subdir>/<date>/<title>.md（日期目录分类）；
            # 否则保持原有 Articles/<date> <title>.md 平铺
            subdir = (src.get("subdir") or "").strip("/")
            if subdir:
                fn = re.sub(r'[\\/:*?"<>|]', "-", fn_title)
                fn = re.sub(r"\s+", " ", fn).strip() + ".md"
                out_dir = os.path.join(ARTICLES, subdir, p["date"] or "nodate")
            else:
                fn = re.sub(r'[\\/:*?"<>|]', "-", f"{p['date']} {fn_title}.md")
                fn = re.sub(r"\s+", " ", fn).strip()
                out_dir = ARTICLES
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
                f'type: article\n---\n\n# {p["title"]}\n\n'
            )
            # Key takeaways：抓取后自动生成精简概括，写入正文开头
            tak = summarize_takeaways(p["title"], body)
            front += "### Key takeaways\n\n" + "\n\n".join("- " + t for t in tak) + "\n\n"
            front += body + "\n"
            os.makedirs(out_dir, exist_ok=True)
            open(os.path.join(out_dir, fn), "w", encoding="utf-8").write(front)
            existing_slugs.add(slug)
            existing_names.add(fn[:-3].lower())
            added.append((os.path.join(os.path.relpath(out_dir, ARTICLES), fn), words))
            added_src += 1
            print("ADDED:", fn, f"({words} words)")
        # 该源处理完：记录增量游标（下次只拉今天之后的新文章）
        state[src.get("feed") or src["url"]] = today
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
