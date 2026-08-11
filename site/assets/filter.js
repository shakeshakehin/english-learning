/* ============================================================
 * filter.js —— 首页文章筛选（类型 / 主题 / 字数）
 * 依赖 #article-filter 控件 + #article-list 容器 + articles.json
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

  var state = { category: "", topic: "", min: "", max: "" };

  fetch(siteBase() + "articles.json", { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (articles) {
      if (!articles.length) {
        listEl.innerHTML = "<p>暂无文章。</p>";
        return;
      }

      var catSel = document.getElementById("f-category");
      var topicSel = document.getElementById("f-topic");
      var minInp = document.getElementById("f-min");
      var maxInp = document.getElementById("f-max");
      var clearBtn = document.getElementById("f-clear");

      /* 填充下拉选项 */
      var cats = {};
      var topics = {};
      articles.forEach(function (a) {
        cats[a.category || "未分类"] = 1;
        (a.tags || []).forEach(function (t) { topics[t] = 1; });
      });
      Object.keys(cats).sort().forEach(function (c) {
        var o = document.createElement("option");
        o.value = c; o.textContent = c;
        catSel.appendChild(o);
      });
      Object.keys(topics).sort().forEach(function (t) {
        var o = document.createElement("option");
        o.value = t; o.textContent = t;
        topicSel.appendChild(o);
      });

      function render() {
        var min = parseInt(state.min, 10) || 0;
        var max = parseInt(state.max, 10) || Infinity;
        var list = articles.filter(function (a) {
          if (state.category && a.category !== state.category) return false;
          if (state.topic && !(a.tags || []).includes(state.topic)) return false;
          var w = a.words || 0;
          if (w < min || w > max) return false;
          return true;
        });
        if (!list.length) {
          listEl.innerHTML = "<p>没有符合条件的文章。</p>";
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

      catSel.addEventListener("change", function () { state.category = this.value; render(); });
      topicSel.addEventListener("change", function () { state.topic = this.value; render(); });
      minInp.addEventListener("input", function () { state.min = this.value; render(); });
      maxInp.addEventListener("input", function () { state.max = this.value; render(); });
      clearBtn.addEventListener("click", function () {
        state = { category: "", topic: "", min: "", max: "" };
        catSel.value = ""; topicSel.value = ""; minInp.value = ""; maxInp.value = "";
        render();
      });

      render();
    })
    .catch(function () {
      listEl.innerHTML = "<p>文章数据加载失败。</p>";
    });
})();
