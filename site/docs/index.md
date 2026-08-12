# English Learning

软件测试行业英语学习笔记。

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
  <p id="crawl-match">输入关键词可实时筛选文章，并生成抓取命令</p>
  <p class="crawl-cmd">命令：<code id="crawl-cmd">python crawl_and_build.py（默认配置）</code></p>
  <p class="crawl-hint">抓取方式：① 在本机 vault 目录运行上面的命令（或让我来抓）；② GitHub 手动触发（可选关键词）；③ 每天 06:00 自动按配置抓取。抓取后约 1-2 分钟网页更新。</p>
</div>

<div id="article-list"><p>加载中…</p></div>

*最后更新: 2026-08-12*
