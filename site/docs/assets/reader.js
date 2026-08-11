/* ============================================================
 * reader.js —— 文章页功能：
 *  1. 生词高亮：加载 wordDB.json，正文中出现的生词加荧光笔
 *  2. 阅读速度控制：底部进度条 + 播放（词/分钟），当前词下划线
 * ============================================================ */
(function () {
  "use strict";

  /* ---- 站点根路径推导（兼容 github.io 子路径与自定义域名根路径） ---- */
  function siteBase() {
    var p = location.pathname;
    if (/^\/(Articles|Languages|assets)\//.test(p)) return "/";
    var m = p.match(/^\/([^/]+)\//);
    return m ? "/" + m[1] + "/" : "/";
  }

  var isArticlePage = document.querySelector(".md-content") && !document.querySelector("#article-list");

  /* ================= 1. 生词高亮 ================= */
  function loadVocab() {
    return fetch(siteBase() + "wordDB.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; });
  }

  function cleanWord(t) {
    return t.replace(/^[^A-Za-z]+/, "").replace(/[^A-Za-z]+$/, "").toLowerCase();
  }

  function highlightVocab(words) {
    if (!words.length) return;
    var set = {};
    words.forEach(function (w) { set[w.word.toLowerCase()] = w.meaning || ""; });
    var paras = document.querySelectorAll(".md-content p, .md-content li");
    paras.forEach(function (p) {
      var walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function (n) {
        if (!n.textContent.trim()) return;
        if (n.parentElement && n.parentElement.closest("a, code, mark, h1, h2, h3, h4, h5, h6, pre")) return;
        var text = n.textContent;
        var parts = text.split(/(\s+)/);
        var frag = document.createDocumentFragment();
        parts.forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          var cw = cleanWord(part);
          if (set[cw]) {
            var mark = document.createElement("mark");
            mark.className = "rw vocab";
            mark.textContent = part;
            frag.appendChild(mark);
          } else {
            frag.appendChild(document.createTextNode(part));
          }
        });
        n.parentNode.replaceChild(frag, n);
      });
    });
  }

  /* ================= 2. 阅读速度控制 ================= */
  function buildReader(words) {
    var content = document.querySelector(".md-content");
    if (!content) return;
    var paras = content.querySelectorAll("p");
    if (!paras.length) return;

    /* 切词：把正文段落文本切成 span.rw（跳过 a/code/mark/h 内） */
    var tokens = [];
    paras.forEach(function (p) {
      var walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function (n) {
        if (!n.textContent.trim()) return;
        if (n.parentElement && n.parentElement.closest("a, code, mark, h1, h2, h3, h4, h5, h6, pre")) return;
        var parts = n.textContent.split(/(\s+)/);
        var frag = document.createDocumentFragment();
        parts.forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          var span = document.createElement("span");
          span.className = "rw";
          span.textContent = part;
          frag.appendChild(span);
          tokens.push(span);
        });
        n.parentNode.replaceChild(frag, n);
      });
    });
    if (tokens.length < 20) return;

    /* 生词标记：切词后的 span 若在词表 → 加 vocab 类 */
    if (words.length) {
      var set = {};
      words.forEach(function (w) { set[w.word.toLowerCase()] = 1; });
      tokens.forEach(function (s) {
        if (set[cleanWord(s.textContent)]) s.classList.add("vocab");
      });
    }

    /* UI */
    var ui = document.createElement("div");
    ui.id = "reader-controls";
    ui.innerHTML =
      '<span class="rw-label">速度</span>' +
      '<select id="rw-speed">' +
      '<option value="120">120 词/分</option>' +
      '<option value="200" selected>200 词/分</option>' +
      '<option value="300">300 词/分</option>' +
      '<option value="450">450 词/分</option>' +
      "</select>" +
      '<button id="rw-play">播放</button>' +
      '<input type="range" id="rw-progress" min="0" max="100" value="0">' +
      '<span id="rw-pos">0 / ' + tokens.length + "</span>";
    document.body.appendChild(ui);

    var progress = document.getElementById("rw-progress");
    var posEl = document.getElementById("rw-pos");
    var playBtn = document.getElementById("rw-play");
    var speedSel = document.getElementById("rw-speed");

    var currentIdx = 0;
    var timer = null;
    var playing = false;

    function setCurrent(idx) {
      idx = Math.max(0, Math.min(tokens.length - 1, idx));
      if (tokens[currentIdx]) tokens[currentIdx].classList.remove("current", "done");
      currentIdx = idx;
      var el = tokens[currentIdx];
      el.classList.add("current");
      for (var i = 0; i < currentIdx; i++) tokens[i].classList.add("done");
      for (var j = currentIdx + 1; j < tokens.length; j++) tokens[j].classList.remove("done");
      progress.value = Math.round((currentIdx / (tokens.length - 1)) * 100);
      posEl.textContent = (currentIdx + 1) + " / " + tokens.length;
      /* 播放时保持当前词可见 */
      var r = el.getBoundingClientRect();
      if (r.top < 60 || r.bottom > window.innerHeight - 80) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }

    function stop() {
      playing = false;
      if (timer) clearInterval(timer);
      timer = null;
      playBtn.textContent = "播放";
    }

    playBtn.addEventListener("click", function () {
      if (playing) { stop(); return; }
      playing = true;
      playBtn.textContent = "暂停";
      var wpm = parseInt(speedSel.value, 10);
      var delay = Math.round(60000 / wpm);
      if (currentIdx >= tokens.length - 1) setCurrent(0);
      timer = setInterval(function () {
        if (currentIdx >= tokens.length - 1) { stop(); return; }
        setCurrent(currentIdx + 1);
      }, delay);
    });

    speedSel.addEventListener("change", function () {
      if (playing) {
        stop();
        playBtn.click();
      }
    });

    var dragging = false;
    progress.addEventListener("input", function () {
      dragging = true;
      if (playing) stop();
      var pct = parseInt(progress.value, 10);
      setCurrent(Math.round((pct / 100) * (tokens.length - 1)));
    });
    progress.addEventListener("change", function () { dragging = false; });
  }

  /* ---- 启动：先高亮生词，再切词建阅读组件 ---- */
  if (isArticlePage) {
    loadVocab().then(function (words) {
      highlightVocab(words);
      buildReader(words);
    });
  }
})();
