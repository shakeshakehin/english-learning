# English Learning

软件测试行业英语学习笔记。

> **自动抓取配置**：Software Testing News；Software Testing Help；Perfect Daily Grind；Sprudge；Daily Coffee News；Barista Magazine；The Guardian 社論；The Guardian 評論（全部主题），250–5000 词，每源每次最多 2 篇。每天自动更新。

<div id="article-filter">
  <input id="f-search" type="text" placeholder="输入关键词实时筛选（如 ai / automation / 测试）">
  <input id="f-min" type="number" placeholder="最少字数" min="0">
  <input id="f-max" type="number" placeholder="最多字数" min="0">
  <button id="f-clear">重置</button>
</div>

<div id="crawl-console">
  <h4>抓取新文章（按主题 + 字数）</h4>
  <div class="crawl-row">
    <input id="crawl-kw" type="text" placeholder="输入主题关键词，如 ai, automation, coffee">
    <input id="crawl-min" type="number" placeholder="最少字数" min="0">
    <input id="crawl-max" type="number" placeholder="最多字数" min="0">
    <button id="crawl-copy">复制抓取命令</button>
    <a id="crawl-github" href="https://github.com/shakeshakehin/english-learning/actions/workflows/crawl.yml" target="_blank" rel="noopener">GitHub 手动触发</a>
  </div>
  <p id="crawl-match">输入主题关键词可实时筛选已有文章（上面列表），并生成抓取命令。</p>
  <p class="crawl-cmd">命令：<code id="crawl-cmd">python crawl_and_build.py（默认配置）</code></p>
  <p class="crawl-hint"><b>说明：</b>本站是纯静态页，浏览器无法直接运行抓取脚本，所以「筛选」用来<br>① 看已有文章里有没有你想要的；② 帮你生成对应的抓取命令。<br>真正抓取需三选一：① 本机 vault 目录运行上面的命令（或让我抓）；② 点「GitHub 手动触发」在 Actions 里填关键词/字数运行；③ 每天 06:00 自动按配置抓取。抓取后约 1-2 分钟网页更新。</p>
</div>

<div id="article-list"><p>加载中…</p></div>

*最后更新: 2026-08-14*
