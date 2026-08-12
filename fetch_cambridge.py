# -*- coding: utf-8 -*-
"""fetch_cambridge.py —— 生词释义接入剑桥（本地/构建层）
剑桥词典网页无 CORS，浏览器前端无法实时抓取，因此在本地批量抓取并缓存：
  读取 wordDB.md 的生词 → 抓剑桥中英双解（限速+缓存）→ 写 cambridge_cache.json
build.py 会把缓存合并进 wordDB.json，供前端生词高亮/悬浮窗/生词表使用。

用法（vault 根目录）：
  python fetch_cambridge.py            # 抓 wordDB.md 全部生词
  python fetch_cambridge.py --force    # 忽略缓存强制重抓
"""
import json
import os
import re
import sys
import time
import urllib.request

REPO = os.path.dirname(os.path.abspath(__file__))
LANG_MD = os.path.join(REPO, "Languages", "wordDB.md")
CACHE = os.path.join(REPO, "Languages", "cambridge_cache.json")
BASE = "https://dictionary.cambridge.org/zhs/dictionary/english-chinese-simplified/"
UA = {"User-Agent": "Mozilla/5.0 (English-Learning-Site/1.0) English learning vocab tool; respectful crawl"}
DELAY = 1.5  # 限速：尊重站点，避免被封


def load_words():
    words = []
    if not os.path.exists(LANG_MD):
        return words
    for line in open(LANG_MD, encoding="utf-8"):
        line = line.strip()
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) >= 2 and re.fullmatch(r"[a-z][a-z'\-]*", cells[0].lower()):
            words.append(cells[0].lower())
    # 去重保序
    seen = set()
    return [w for w in words if not (w in seen or seen.add(w))]


def load_cache():
    if os.path.exists(CACHE):
        try:
            return json.load(open(CACHE, encoding="utf-8"))
        except Exception:
            return {}
    return {}


def fetch_cambridge(word):
    """抓剑桥中英双解页面，返回 {meaning, pos, def_en, zh}（无则 None）"""
    url = BASE + urllib.parse.quote(word)
    req = urllib.request.Request(url, headers=UA)
    try:
        html = urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "ignore")
    except Exception:
        return None
    # 中文释义（trans dtrans），可能多条
    zh = re.findall(r'<span class="trans dtrans[^"]*"[^>]*>.*?<span class="dtrans">(.*?)</span>', html, re.S)
    # 英文释义（ddef_d）
    defs = re.findall(r'<div class="def ddef_d db">(.*?)</div>', html, re.S)
    pos = re.findall(r'<span class="pos dpos">(.*?)</span>', html, re.S)
    if not zh and not defs:
        return None
    clean = lambda s: re.sub(r"<[^>]+>", "", s).strip()
    return {
        "word": word,
        "meaning": "；".join(dict.fromkeys(clean(x) for x in zh if clean(x))),
        "def_en": "；".join(dict.fromkeys(clean(x) for x in defs if clean(x))),
        "pos": "；".join(dict.fromkeys(clean(x) for x in pos if clean(x))),
    }


def main():
    force = "--force" in sys.argv
    words = load_words()
    cache = load_cache()
    if not words:
        print("wordDB.md 无生词，无需抓取")
        return
    updated = 0
    for i, w in enumerate(words):
        if not force and w in cache and cache[w]:
            continue
        print(f"[{i+1}/{len(words)}] {w} ...", end=" ", flush=True)
        r = fetch_cambridge(w)
        if r:
            cache[w] = r
            print("OK:", r["meaning"][:40])
            updated += 1
        else:
            cache[w] = None
            print("未找到")
        time.sleep(DELAY)  # 限速
    json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\n完成：抓取/更新 {updated} 个，缓存共 {sum(1 for v in cache.values() if v)} 个词")
    if not updated:
        print("（无新抓取，均为缓存命中。可用 --force 强制重抓）")


if __name__ == "__main__":
    import urllib.parse
    main()
