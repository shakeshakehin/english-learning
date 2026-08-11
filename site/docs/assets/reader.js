/* ============================================================
 * reader.js —— 文章页功能：
 *  1. 生词高亮：wordDB.json（全站同步）+ 本机标记（localStorage）合并高亮
 *  2. 网页标记：框选单词 + 按 C -> 存入本机生词表（可导出表格行合并进本地 wordDB.md）
 *  3. 聚焦阅读（无障碍辅助）：当前词放大高亮 + 当前句淡背景，其余文字淡化；
 *     页面滚动自动跟随；右侧中间垂直滑块可拖动跳转，滑条上滚轮逐词精细推进
 * ============================================================ */
(function () {
  "use strict";

  var LS_KEY = "lexiVocab"; /* 本机标记词: {word: {meaning, ts}} */

  /* ---- 站点根路径推导（兼容 github.io 子路径与自定义域名根路径） ---- */
  function siteBase() {
    var p = location.pathname;
    if (/^\/(Articles|Languages|assets)\//.test(p)) return "/";
    var m = p.match(/^\/([^/]+)\//);
    return m ? "/" + m[1] + "/" : "/";
  }

  var isArticlePage = document.querySelector(".md-content") && !document.querySelector("#article-list");

  /* ================= 生词数据 ================= */
  function loadServerVocab() {
    return fetch(siteBase() + "wordDB.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; });
  }

  function loadLocalVocab() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    } catch (e) { return {}; }
  }

  function saveLocalVocab(map) {
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  }

  function cleanWord(t) {
    return t.replace(/^[^A-Za-z]+/, "").replace(/[^A-Za-z]+$/, "").toLowerCase();
  }

  function mergeVocab(serverList) {
    var map = {};
    (serverList || []).forEach(function (w) { map[w.word.toLowerCase()] = w.meaning || ""; });
    var local = loadLocalVocab();
    Object.keys(local).forEach(function (w) { map[w] = local[w].meaning || ""; });
    return map;
  }

  /* ================= 1. 生词高亮 ================= */
  function highlightVocab(map) {
    var words = Object.keys(map);
    if (!words.length) return;
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
          if (words.indexOf(cw) >= 0) {
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

  /* 标记新词后：页面内立即高亮该词 */
  function highlightWordInPage(word) {
    var spans = document.querySelectorAll(".md-content .rw, .md-content mark.rw");
    var hit = 0;
    spans.forEach(function (s) {
      if (cleanWord(s.textContent) === word && !s.classList.contains("vocab")) {
        s.classList.add("vocab");
        hit++;
      }
    });
    if (hit) return hit;
    var paras = document.querySelectorAll(".md-content p");
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
          if (cleanWord(part) === word) {
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
    return hit;
  }

  /* ================= Toast ================= */
  var toastEl = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.id = "lexi-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function () { toastEl.hidden = true; }, 2200);
  }

  /* ================= 2. 网页标记（框选 + 按 C） ================= */
  function setupMarking() {
    document.addEventListener("keydown", function (e) {
      var k = e.key || e.keyCode;
      var isC = k === "c" || k === "C" || k === 67;
      if (!isC) return;
      var t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed) { toast("先框选一个单词，再按 C 标记"); return; }
      var text = sel.toString().trim();
      if (!text) return;
      var m = text.match(/[A-Za-z][A-Za-z'\-]*/);
      if (!m) { toast("选区中没有英文单词"); return; }
      var word = m[0].toLowerCase();
      e.preventDefault();
      var local = loadLocalVocab();
      if (local[word]) {
        toast("「" + word + "」已在生词表中");
        return;
      }
      var meaning = "";
      try {
        meaning = window.prompt("「" + word + "」的中文释义（可留空，稍后补充）：", "").trim();
      } catch (err) { meaning = ""; }
      local[word] = { meaning: meaning || "待补充", ts: Date.now() };
      saveLocalVocab(local);
      var n = highlightWordInPage(word);
      toast("✓ 已标记「" + word + "」" + (n ? "（本页高亮 " + n + " 处）" : ""));
    });
  }

  /* ================= 生词管理弹窗 ================= */
  function setupVocabPanel() {
    var modal = document.createElement("div");
    modal.id = "lexi-modal";
    modal.innerHTML =
      '<div class="lm-box">' +
      "<h4>本机已标记生词（<span id=\"lm-count\">0</span>）</h4>" +
      '<p class="lm-hint">把下面的表格行复制到本地 Obsidian 的 <code>Languages/wordDB.md</code> 中（释义可修改），' +
      "然后在本地运行 <code>deploy.sh</code>，全站即可同步生效。</p>" +
      '<textarea id="lm-rows" readonly rows="6" spellcheck="false"></textarea>' +
      '<div class="lm-btns"><button id="lm-copy">复制表格行</button>' +
      '<button id="lm-clear">清空本机标记</button>' +
      '<button id="lm-close">关闭</button></div>' +
      "</div>";
    document.body.appendChild(modal);

    function rowsText() {
      var local = loadLocalVocab();
      var rows = Object.keys(local)
        .sort()
        .map(function (w) { return "| " + w + " | " + (local[w].meaning || "待补充") + " |"; });
      return rows.join("\n");
    }

    function refresh() {
      var local = loadLocalVocab();
      document.getElementById("lm-count").textContent = Object.keys(local).length;
      document.getElementById("lm-rows").value = rowsText();
    }

    document.getElementById("lm-copy").addEventListener("click", function () {
      var txt = rowsText();
      if (!txt) { toast("还没有本机标记的词"); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function () { toast("已复制到剪贴板"); });
      } else {
        var ta = document.getElementById("lm-rows");
        ta.select();
        document.execCommand("copy");
        toast("已复制到剪贴板");
      }
    });
    document.getElementById("lm-clear").addEventListener("click", function () {
      if (window.confirm("清空本机标记的生词？")) {
        saveLocalVocab({});
        refresh();
        toast("本机标记已清空");
      }
    });
    document.getElementById("lm-close").addEventListener("click", function () {
      modal.hidden = true;
    });
    modal.addEventListener("click", function (e) {
      if (e.target === modal) modal.hidden = true;
    });

    return {
      open: function () { refresh(); modal.hidden = false; },
    };
  }

  /* ================= 3. 聚焦阅读（无障碍） ================= */
  function buildFocusReader(map) {
    var content = document.querySelector(".md-content");
    if (!content) return null;
    var paras = content.querySelectorAll("p");
    if (!paras.length) return null;

    /* 切词 + 分句：每个词记录句子编号（data-sid，按句末标点递增） */
    var tokens = [];
    var sid = 0;
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
          span.dataset.sid = sid;
          frag.appendChild(span);
          tokens.push(span);
          if (/[.!?;:]$/.test(part)) sid++;
        });
        n.parentNode.replaceChild(frag, n);
      });
    });
    if (tokens.length < 20) return null;

    /* 生词标记：切词后词表词 → vocab 类 */
    var words = Object.keys(map);
    if (words.length) {
      tokens.forEach(function (s) {
        if (words.indexOf(cleanWord(s.textContent)) >= 0) s.classList.add("vocab");
      });
    }

    /* UI：右侧中间垂直控制条（聚焦开关 + 滑块 + 位置） */
    var ui = document.createElement("div");
    ui.id = "reader-controls";
    ui.innerHTML =
      '<button id="rw-focus" class="on" title="聚焦模式：突出当前词与句子，淡化其余文字">聚焦</button>' +
      '<input type="range" id="rw-progress" orient="vertical" min="0" max="100" value="0" ' +
      'title="拖动跳转位置；在滑条上滚动鼠标滚轮可逐词推进">' +
      '<span id="rw-pos">1 / ' + tokens.length + "</span>" +
      '<button id="rw-vocab" title="查看本机标记的生词">生词</button>';
    document.body.appendChild(ui);

    var progress = document.getElementById("rw-progress");
    var posEl = document.getElementById("rw-pos");
    var focusBtn = document.getElementById("rw-focus");
    var vocabBtn = document.getElementById("rw-vocab");

    var focusOn = true;
    var currentEl = null;

    function clearFocus() {
      if (currentEl) currentEl.classList.remove("current");
      tokens.forEach(function (t) { t.classList.remove("sentence-active"); });
      currentEl = null;
    }

    function setFocus(el, opts) {
      opts = opts || {};
      clearFocus();
      currentEl = el;
      el.classList.add("current");
      var s = el.dataset.sid;
      tokens.forEach(function (t) {
        if (t.dataset.sid === s) t.classList.add("sentence-active");
      });
      document.body.classList.add("focus-on");
      var idx = tokens.indexOf(el);
      progress.value = Math.round((idx / (tokens.length - 1)) * 100);
      posEl.textContent = (idx + 1) + " / " + tokens.length;
      if (opts.scroll) {
        var r = el.getBoundingClientRect();
        if (r.top < 90 || r.bottom > window.innerHeight - 90) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }
    }

    function findCenterWord() {
      var mid = window.innerHeight / 2;
      var best = null;
      var bestDist = Infinity;
      tokens.forEach(function (t) {
        var r = t.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        var c = (r.top + r.bottom) / 2;
        var d = Math.abs(c - mid);
        if (d < bestDist) { bestDist = d; best = t; }
      });
      return best;
    }

    /* 页面滚动 → 聚焦跟随视口中心词 */
    var scrollTimer = null;
    window.addEventListener("scroll", function () {
      if (!focusOn) return;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function () {
        var el = findCenterWord();
        if (el && el !== currentEl) setFocus(el, {});
      }, 120);
    }, { passive: true });

    /* 滑块拖动 → 跳转 */
    progress.addEventListener("input", function () {
      var pct = parseInt(progress.value, 10);
      var idx = Math.round((pct / 100) * (tokens.length - 1));
      setFocus(tokens[idx], { scroll: true });
    });

    /* 滑块上滚轮 → 逐词精细推进 */
    progress.addEventListener("wheel", function (e) {
      e.preventDefault();
      var delta = e.deltaY > 0 ? 1 : -1;
      var idx = currentEl ? tokens.indexOf(currentEl) : 0;
      idx = Math.max(0, Math.min(tokens.length - 1, idx + delta));
      setFocus(tokens[idx], { scroll: true });
    }, { passive: false });

    /* 聚焦开关 */
    focusBtn.addEventListener("click", function () {
      focusOn = !focusOn;
      focusBtn.classList.toggle("on", focusOn);
      document.body.classList.toggle("focus-on", focusOn);
      if (focusOn) {
        var el = currentEl || findCenterWord();
        if (el) setFocus(el, {});
      } else {
        clearFocus();
        document.body.classList.remove("focus-on");
      }
    });

    /* 生词面板 */
    var panel = setupVocabPanel();
    vocabBtn.addEventListener("click", function () { panel.open(); });

    /* 初始聚焦：视口中心词 */
    setTimeout(function () {
      var el = findCenterWord();
      if (el) setFocus(el, {});
    }, 150);

    return { panel: ui };
  }

  /* ---- 启动 ---- */
  if (isArticlePage) {
    loadServerVocab().then(function (server) {
      var map = mergeVocab(server);
      highlightVocab(map);
      buildFocusReader(map);
      setupMarking();
    });
  }
})();
