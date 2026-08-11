/* ============================================================
 * filter.js —— 首页：
 *  1. 实时关键词筛选：输入即过滤（标题/类型/标签）
 *  2. 抓取控制台：当前关键词 → 生成抓取命令（本地/GitHub 触发）
 * 依赖 #f-search / #f-min / #f-max / #article-list / #crawl-console
 * ============================================================ */
(function () {
  "use strict";

  var listEl = document.getElementById("article-list");
  if (!listEl) return; /* 非首页 */

  function siteBase() {
    var p = location.pathname;
    if (/^\/(Articles|Languages|assets)\//.test(p)) return "/";
    var m = p.match(/^\/([^/]+)\//);
    return m ? "/" + m[1] + "/" : "/";
  }

  var articles = [];
  var state = { kw: "", min: "", max: "" };

  fetch(siteBase() + "articles.json", { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (data) {
      articles = data;
      if (!articles.length) {
        listEl.innerHTML = "<p>暂无文章。</p>";
        return;
      }
      bind();
      render();
    })
    .catch(function () {
      listEl.innerHTML = "<p>文章数据加载失败。</p>";
    });

  function bind() {
    var search = document.getElementById("f-search");
    var minInp = document.getElementById("f-min");
    var maxInp = document.getElementById("f-max");
    var clearBtn = document.getElementById("f-clear");
    var crawlKw = document.getElementById("crawl-kw");

    /* 实时关键词筛选（防抖） */
    var t = null;
    search.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(function () {
        state.kw = search.value.trim();
        if (crawlKw) crawlKw.value = state.kw; /* 联动抓取控制台 */
        render();
        updateCrawl();
      }, 150);
    });
    minInp.addEventListener("input", function () { state.min = this.value; render(); });
    maxInp.addEventListener("input", function () { state.max = this.value; render(); });
    clearBtn.addEventListener("click", function () {
      state = { kw: "", min: "", max: "" };
      search.value = ""; minInp.value = ""; maxInp.value = "";
      if (crawlKw) crawlKw.value = "";
      render();
      updateCrawl();
    });

    /* 抓取控制台 */
    if (crawlKw) {
      var t2 = null;
      crawlKw.addEventListener("input", function () {
        clearTimeout(t2);
        t2 = setTimeout(function () {
          state.kw = crawlKw.value.trim();
          search.value = state.kw;
          render();
          updateCrawl();
        }, 150);
      });
      var copyBtn = document.getElementById("crawl-copy");
      if (copyBtn) {
        copyBtn.addEventListener("click", function () {
          var cmd = crawlCommand();
          if (!cmd) { toast("先输入抓取关键词"); return; }
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(cmd).then(function () { toast("已复制抓取命令"); });
          } else {
            var ta = document.createElement("textarea");
            ta.value = cmd;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            ta.remove();
            toast("已复制抓取命令");
          }
        });
      }
    }
  }

  function matchesKw(a, kw) {
    if (!kw) return true;
    var k = kw.toLowerCase();
    var hay = ((a.title || "") + " " + (a.category || "") + " " + ((a.tags || []).join(" "))).toLowerCase();
    return k.split(/[,\s]+/).every(function (w) { return w && hay.indexOf(w) >= 0; });
  }

  function render() {
    var min = parseInt(state.min, 10) || 0;
    var max = parseInt(state.max, 10) || Infinity;
    var list = articles.filter(function (a) {
      if (!matchesKw(a, state.kw)) return false;
      var w = a.words || 0;
      return w >= min && w <= max;
    });
    if (!list.length) {
      listEl.innerHTML = "<p>没有符合条件的文章" + (state.kw ? "（关键词：「" + state.kw + "」）" : "") + "。</p>";
      return;
    }
    listEl.innerHTML = "";
    list.forEach(function (a) {
      var card = document.createElement("a");
      card.className = "article-card";
      card.href = a.url;
      var meta = [
        a.category ? '<span class="tag">' + a.category + "</span>" : "",
        (a.tags || []).map(function (t) { return '<span class="tag">' + t + "</span>"; }).join(""),
        a.published ? a.published : "",
        a.words ? a.words + " 词" : "",
      ].filter(Boolean).join("");
      card.innerHTML =
        '<div class="ac-title"></div><div class="ac-meta">' + meta + "</div>";
      card.querySelector(".ac-title").textContent = a.title;
      listEl.appendChild(card);
    });
  }

  function crawlCommand() {
    var kw = state.kw;
    if (!kw) return "";
    return "python crawl_and_build.py --keyword " + kw.split(/[,\s]+/).filter(Boolean).join(",");
  }

  function updateCrawl() {
    var matchEl = document.getElementById("crawl-match");
    var cmdEl = document.getElementById("crawl-cmd");
    if (!matchEl && !cmdEl) return;
    var n = articles.filter(function (a) { return matchesKw(a, state.kw); }).length;
    if (matchEl) {
      matchEl.textContent = state.kw
        ? "关键词「" + state.kw + "」匹配已有文章 " + n + " 篇"
        : "输入关键词可实时筛选文章，并生成抓取命令";
    }
    if (cmdEl) {
      var cmd = crawlCommand();
      cmdEl.textContent = cmd
        ? "python crawl_and_build.py --keyword " + state.kw.split(/[,\s]+/).filter(Boolean).join(",")
        : "python crawl_and_build.py（默认配置）";
    }
  }

  function toast(msg) {
    var el = document.createElement("div");
    el.id = "lexi-toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2200);
  }
})();
