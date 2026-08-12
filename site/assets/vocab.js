/* ============================================================
 * vocab.js —— 生词表页（/Vocab/）：
 *  1. 本机标记生词（localStorage）：按日期分组、可折叠，每词含释义+来源原句+文章
 *  2. 已同步到全站的生词（wordDB.json，含剑桥释义）
 * 依赖 #vocab-list / #vocab-synced / #vocab-toolbar
 * ============================================================ */
(function () {
  "use strict";

  var listEl = document.getElementById("vocab-list");
  var syncedEl = document.getElementById("vocab-synced");
  if (!listEl) return; /* 非生词表页 */

  var LS_KEY = "lexiVocab";

  function siteBase() {
    var p = location.pathname;
    if (/^\/(Articles|Languages|Vocab|assets)\//.test(p)) return "/";
    var m = p.match(/^\/([^/]+)\//);
    return m ? "/" + m[1] + "/" : "/";
  }

  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch (e) { return {}; }
  }
  function saveLocal(map) { localStorage.setItem(LS_KEY, JSON.stringify(map)); }

  /* 按日期分组（倒序），返回 [[date, [entries]], ...] */
  function groupByDate(entries) {
    var g = {};
    entries.forEach(function (e) {
      var d = e.date || "未标注日期";
      (g[d] = g[d] || []).push(e);
    });
    return Object.keys(g).sort().reverse().map(function (d) { return [d, g[d]]; });
  }

  function renderLocal() {
    var local = loadLocal();
    var words = Object.keys(local);
    document.getElementById("vocab-count").textContent = words.length;
    listEl.innerHTML = "";
    if (!words.length) {
      listEl.innerHTML = "<p>还没有本机标记的生词。阅读文章时点「生词」按钮即可标记。</p>";
      return;
    }
    var entries = words.map(function (w) {
      var e = local[w];
      return { word: w, meaning: e.meaning || "", sentence: e.sentence || "", article: e.article || "", date: e.date || "" };
    });
    groupByDate(entries).forEach(function (grp) {
      var d = grp[0], items = grp[1];
      var head = document.createElement("div");
      head.className = "date-group vocab-group collapsed"; /* 默认收起 */
      head.innerHTML = "<span class=\"dg-arrow\">▸</span> " + d + "（" + items.length + " 个）";
      head.addEventListener("click", function () {
        var wrap = head.nextElementSibling;
        head.classList.toggle("collapsed");
        wrap.classList.toggle("hidden");
        head.querySelector(".dg-arrow").textContent = head.classList.contains("collapsed") ? "▸" : "▾";
      });
      listEl.appendChild(head);
      var wrap = document.createElement("div");
      wrap.className = "vocab-day hidden";
      items.forEach(function (e) {
        var card = document.createElement("div");
        card.className = "vocab-card";
        card.innerHTML =
          "<div class=\"vc-word\">词：<strong></strong></div>" +
          "<div class=\"vc-m\">翻译：<span></span></div>" +
          "<div class=\"vc-s\">原句：<span></span></div>" +
          "<div class=\"vc-a\"></div>";
        card.querySelector(".vc-word strong").textContent = e.word;
        card.querySelector(".vc-m span").textContent = e.meaning || "待补充";
        card.querySelector(".vc-s span").textContent = e.sentence ? "『" + e.sentence + "』" : "（未记录原句）";
        card.querySelector(".vc-a").textContent = e.article ? "来源：" + e.article : "";
        wrap.appendChild(card);
      });
      listEl.appendChild(wrap);
    });
  }

  function renderSynced(list) {
    if (!syncedEl) return;
    syncedEl.innerHTML = "";
    if (!list || !list.length) { syncedEl.innerHTML = "<p>暂无全站生词。</p>"; return; }
    var table = document.createElement("table");
    table.className = "vocab-synced-tbl";
    var html = "<tr><th>单词</th><th>释义</th><th>词性</th><th>英文释义</th></tr>";
    list.forEach(function (w) {
      html += "<tr><td>" + w.word + "</td><td>" + (w.meaning || "") + "</td><td>" + (w.pos || "") +
        "</td><td>" + (w.def_en || "") + "</td></tr>";
    });
    table.innerHTML = html;
    syncedEl.appendChild(table);
  }

  /* 导出：复制 wordDB 表格行（含来源/日期），供贴到 Languages/wordDB.md */
  document.getElementById("vocab-export").addEventListener("click", function () {
    var local = loadLocal();
    var rows = Object.keys(local).sort().map(function (w) {
      var e = local[w];
      var sent = (e.sentence || "").replace(/\|/g, "｜").slice(0, 140);
      return "| " + w + " | " + (e.meaning || "待补充") + " | " + sent + " | " + (e.date || "") + " |";
    }).join("\n");
    if (!rows) { alert("还没有本机标记的词"); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(rows).then(function () { alert("已复制，粘贴到 wordDB.md 即可"); });
    } else {
      var ta = document.createElement("textarea");
      ta.value = rows; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove(); alert("已复制，粘贴到 wordDB.md 即可");
    }
  });
  document.getElementById("vocab-clear").addEventListener("click", function () {
    if (window.confirm("清空本机标记的生词？")) { saveLocal({}); renderLocal(); }
  });

  renderLocal();
  fetch(siteBase() + "wordDB.json", { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(renderSynced)
    .catch(function () { if (syncedEl) syncedEl.innerHTML = "<p>同步生词加载失败。</p>"; });
})();
