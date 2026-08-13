# 生词表

> 阅读时点「生词」按钮标记的词会显示在这里（含来源原句与日期）。
> 双向同步：标记时写入本地词库文件（`Languages/local_vocab.json`），打开本页自动从本地拉取合并。需先运行本地服务 `python sync_server.py`；未连接时仅存当前浏览器。

<div id="vocab-sync-status" class="vocab-sync">○ 检测本地同步服务…</div>

<div id="vocab-toolbar">
  <span>本机标记 <b id="vocab-count">0</b> 个</span>
  <button id="vocab-export">导出为 wordDB 表格</button>
  <button id="vocab-clear">清空本机标记</button>
  <button id="vocab-review">随机复习一句</button>
</div>

<div id="vocab-review-box" hidden>
  <div id="vocab-review-sentence"></div>
  <div id="vocab-review-word"></div>
  <button id="vocab-review-next">换一句</button>
</div>

<div id="vocab-list"><p>加载中…</p></div>

<p class="crawl-hint"><b>已同步到全站的生词</b>（来自 wordDB，含剑桥释义）：</p>
<div id="vocab-synced"><p>加载中…</p></div>
