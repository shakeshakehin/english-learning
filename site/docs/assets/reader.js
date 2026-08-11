/* ============================================================
 * reader.js —— 文章页功能：
 *  1. 生词高亮：wordDB.json（全站同步）+ 本机标记（localStorage）合并高亮
 *  2. 网页标记：框选单词 + 按 C -> 存入本机生词表（可导出表格行合并进本地 wordDB.md）
 *  3. 阅读速度控制：底部进度条 + 播放（词/分钟），当前词下划线
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

  /* 全部词表：服务器 + 本机（返回 {word: meaning}） */
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

  /* 标记新词后：页面内立即高亮该词（对已切词的 span 或文本节点） */
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
    /* 未切词时回退到文本节点扫描 */
    var paras = document.querySelectorAll(".md-content p");
    paras.forEach(function (p) {
      var walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function (n) {
        if (!n.textContent.trim()) return;
        if (n.parentElement && n.parentElement.closest("a, code, mark, h1, h2, h3, h4, h5, h6, pre")) return;
        var re = new RegExp("(^|\\\\s)(" + word + ")(?=\\\\s|$|[.,;:!?'\"])", "i");
        if (re.test(n.textContent)) {
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
          hit++;
        }
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

  /* ================= 3. 阅读速度控制 ================= */
  function buildReader(map) {
    var content = document.querySelector(".md-content");
    if (!content) return null;
    var paras = content.querySelectorAll("p");
    if (!paras.length) return null;

    /* 切词：正文段落文本切成 span.rw（跳过 a/code/mark/h 内） */
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
    if (tokens.length < 20) return null;

    /* 生词标记：切词后的 span 若在词表 → vocab 类 */
    var words = Object.keys(map);
    if (words.length) {
      tokens.forEach(function (s) {
        if (words.indexOf(cleanWord(s.textContent)) >= 0) s.classList.add("vocab");
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
      '<span id="rw-pos">0 / ' + tokens.length + "</span>" +
      '<button id="rw-vocab" title="查看本机标记的生词">生词</button>';
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
      if (playing) { stop(); playBtn.click(); }
    });

    progress.addEventListener("input", function () {
      if (playing) stop();
      var pct = parseInt(progress.value, 10);
      setCurrent(Math.round((pct / 100) * (tokens.length - 1)));
    });

    return { panel: ui };
  }

  /* ---- 启动 ---- */
  if (isArticlePage) {
    loadServerVocab().then(function (server) {
      var map = mergeVocab(server);
      highlightVocab(map);
      var reader = buildReader(map);
      setupMarking();
      var panel = setupVocabPanel();
      var vocabBtn = reader && reader.panel.querySelector("#rw-vocab");
      if (vocabBtn) vocabBtn.addEventListener("click", function () { panel.open(); });
    });
  }
})();
