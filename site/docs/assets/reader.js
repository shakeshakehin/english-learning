/* ============================================================
 * reader.js —— 文章页功能（v2）：
 *  1. 生词高亮：wordDB.json（全站同步）+ 本机标记（localStorage）合并高亮
 *  2. 聚焦阅读（无障碍）：当前词放大高亮 + 当前句淡背景，其余文字淡化；
 *     页面滚动自动跟随；右侧中间控制条滚轮逐词精细推进
 *  3. 分部分阅读：长文章按句子边界切成若干部分，可翻页跳转
 *  4. 生词标记：点「生词」按钮直接标记当前聚焦词（无需框选/二次确认）
 *  5. 框选自动翻译：选中英文文本自动查词显示中文释义（同 Obsidian 体验）
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

  var isArticlePage = function () {
    return !!document.querySelector(".md-content") && !document.querySelector("#article-list");
  };

  /* ================= 生词数据 ================= */
  function loadServerVocab() {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 6000);
    return fetch(siteBase() + "wordDB.json", { cache: "no-store", signal: ctrl.signal })
      .then(function (r) { clearTimeout(timer); return r.ok ? r.json() : []; })
      .catch(function () { return []; });
  }
  function loadLocalVocab() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch (e) { return {}; }
  }
  function saveLocalVocab(map) { localStorage.setItem(LS_KEY, JSON.stringify(map)); }
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
    toastEl._t = setTimeout(function () { toastEl.hidden = true; }, 2600);
  }

  /* ================= 翻译（Google gtx，支持 CORS） ================= */
  function translate(q) {
    return fetch(
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=" +
        encodeURIComponent(q),
      { cache: "no-store" }
    )
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j[0]) return "";
        var s = "";
        (j[0] || []).forEach(function (x) { if (x && x[0]) s += x[0]; });
        return s.trim();
      })
      .catch(function () { return ""; });
  }

  /* 用翻译接口查词（优先整词，失败退整句/短语） */
  function lookup(q) {
    return translate(q);
  }

  /* ================= 1. 生词高亮（对已切词 token 补 vocab 类） ================= */
  function applyVocabToTokens(map) {
    var words = Object.keys(map);
    if (!words.length) return;
    var spans = document.querySelectorAll(".md-content .rw");
    spans.forEach(function (s) {
      var cw = cleanWord(s.textContent);
      if (words.indexOf(cw) >= 0) s.classList.add("vocab");
      else s.classList.remove("vocab");
    });
  }

  /* 标记新词后：页面内立即高亮该词 */
  function highlightWordInPage(word) {
    var spans = document.querySelectorAll(".md-content .rw");
    var hit = 0;
    spans.forEach(function (s) {
      if (cleanWord(s.textContent) === word && !s.classList.contains("vocab")) {
        s.classList.add("vocab");
        hit++;
      }
    });
    return hit;
  }

  /* ================= 2/3/4/5. 聚焦阅读 + 分部分 + 生词 + 翻译 ================= */
  function buildReader() {
    var content = document.querySelector(".md-content");
    if (!content) return null;

    /* ---- 切词：每个词一个 span.rw，带 data-sid（句号计数） ---- */
    var paras = content.querySelectorAll("p");
    if (!paras.length) return null;
    var tokens = [];
    var sid = 0;
    var _sidText = {}; /* sid -> 句子完整原文（含空格），供生词原句使用 */
    function processPara(p) {
      var walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function (n) {
        if (!n.textContent.trim()) return;
        if (n.parentElement && n.parentElement.closest("a, code, mark, h1, h2, h3, h4, h5, h6, pre, .rw")) return;
        var parts = n.textContent.split(/(\s+)/);
        var frag = document.createDocumentFragment();
        parts.forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) {
            /* 空格：计入 sidText 保留原始空格，但不切词 */
            if (_sidText) _sidText[sid] = (_sidText[sid] || "") + part;
            frag.appendChild(document.createTextNode(part));
            return;
          }
          var span = document.createElement("span");
          span.className = "rw";
          span.textContent = part;
          span.dataset.sid = sid;
          frag.appendChild(span);
          tokens.push(span);
          if (_sidText) _sidText[sid] = (_sidText[sid] || "") + part;
          if (/[.!?;:]$/.test(part)) sid++;
        });
        n.parentNode.replaceChild(frag, n);
      });
    }
    /* 处理 p 和 li（列表/引用内容也纳入） */
    content.querySelectorAll("p, li").forEach(processPara);
    /* 短文也启用聚焦阅读（此前 <20 词直接 return null 导致短文无工具条）。
       0 词（无可切文本）才放弃。 */
    if (!tokens.length) return null;

    /* ---- 分部分：仅长文（≥3000 词）按句子边界切成若干部分，便于分节阅读 ----
       短文（多数）不分部分，整体一屏滚动 + 逐词聚焦即可。 */
    var SPLIT_WORDS = 3000;   /* 超过该词数才启用分部分 */
    var PART_WORDS = 1200;    /* 每部分目标词数 */
    var parts;
    if (tokens.length >= SPLIT_WORDS) {
      var cur2 = [], cw = 0;
      parts = [];
      tokens.forEach(function (t) {
        cur2.push(t); cw++;
        if (cw >= PART_WORDS && /[.!?;:]$/.test(t.textContent)) { parts.push(cur2); cur2 = []; cw = 0; }
      });
      if (cur2.length) parts.push(cur2);
      if (parts.length < 2) parts = [tokens];
    } else {
      parts = [tokens];
    }
    var totalParts = parts.length;
    var curPart = 0;

    /* 生词高亮（词表异步加载后由外部调用） */
    function applyMap(map) { applyVocabToTokens(map); }

    /* ---- UI：右侧中间控制条 ---- */
    var ui = document.createElement("div");
    ui.id = "reader-controls";
    if (totalParts > 1) {
      ui.innerHTML =
        '<button id="rw-prev" title="上一部分">▲</button>' +
        '<span id="rw-part">Part 1/' + totalParts + "</span>" +
        '<button id="rw-focus" class="on" title="聚焦模式：突出当前词与句子">聚焦</button>' +
        '<span id="rw-pos">1 / ' + tokens.length + "</span>" +
        '<button id="rw-vocab" title="标记当前词为生词">生词</button>' +
        '<button id="rw-next" title="下一部分">▼</button>' +
        '<span class="rw-hint">悬停此处<br>滚轮逐词</span>';
    } else {
      ui.innerHTML =
        '<button id="rw-focus" class="on" title="聚焦模式：突出当前词与句子">聚焦</button>' +
        '<span id="rw-pos">1 / ' + tokens.length + "</span>" +
        '<button id="rw-vocab" title="标记当前词为生词">生词</button>' +
        '<span class="rw-hint">悬停此处<br>滚轮逐词</span>';
    }
    document.body.appendChild(ui);

    var posEl = document.getElementById("rw-pos");
    var focusBtn = document.getElementById("rw-focus");
    var vocabBtn = document.getElementById("rw-vocab");
    var prevBtn = document.getElementById("rw-prev");
    var nextBtn = document.getElementById("rw-next");
    var partEl = document.getElementById("rw-part");

    function partTokens() { return parts[curPart] || []; }

    function showPart(p) {
      curPart = Math.max(0, Math.min(totalParts - 1, p));
      tokens.forEach(function (t) {
        t.classList.toggle("part-hidden", parts[curPart].indexOf(t) < 0);
      });
      if (partEl) partEl.textContent = "Part " + (curPart + 1) + "/" + totalParts;
    }
    if (totalParts === 1 && prevBtn) { prevBtn.style.display = "none"; nextBtn.style.display = "none"; }

    function activeIndex(t) { return parts[curPart].indexOf(t); }

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
      partTokens().forEach(function (t) { if (t.dataset.sid === s) t.classList.add("sentence-active"); });
      document.body.classList.add("focus-on");
      var ai = activeIndex(el);
      posEl.textContent = (ai + 1) + " / " + partTokens().length;
      if (opts.scroll) {
        var r = el.getBoundingClientRect();
        if (r.top < 90 || r.bottom > window.innerHeight - 90) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }
    }

    function findCenterWord() {
      var mid = window.innerHeight / 2;
      var best = null, bestDist = Infinity;
      partTokens().forEach(function (t) {
        var r = t.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight || r.width === 0) return;
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

    /* 控制条滚轮 → 逐词推进 */
    ui.addEventListener("wheel", function (e) {
      e.preventDefault();
      var delta = e.deltaY > 0 ? 1 : -1;
      var pt = partTokens();
      var idx = currentEl ? pt.indexOf(currentEl) : 0;
      idx = Math.max(0, Math.min(pt.length - 1, idx + delta));
      setFocus(pt[idx], { scroll: true });
    }, { passive: false });

    /* 聚焦开关 */
    if (focusBtn) focusBtn.addEventListener("click", function () {
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

    /* 上一/下一部分 */
    function gotoPart(delta) {
      var np = Math.max(0, Math.min(totalParts - 1, curPart + delta));
      if (np === curPart) return;
      showPart(np);
      var first = parts[curPart][0];
      setFocus(first, { scroll: true });
      /* 滚动到该部分首词 */
      var r = first.getBoundingClientRect();
      if (r.top < 90 || r.bottom > window.innerHeight - 90) first.scrollIntoView({ block: "center", behavior: "smooth" });
      toast("Part " + (curPart + 1) + "/" + totalParts);
    }
    if (prevBtn) prevBtn.addEventListener("click", function () { gotoPart(-1); });
    if (nextBtn) nextBtn.addEventListener("click", function () { gotoPart(1); });

    /* ---- 生词按钮：点击直接标记当前聚焦词 ---- */
    function currentSentence() {
      /* 取当前聚焦词所在句子的完整文本（保留空格） */
      var el = currentEl || findCenterWord();
      if (!el || !el.dataset.sid) return "";
      var s = el.dataset.sid;
      if (_sidText && _sidText[s]) return _sidText[s].trim();
      var parts = partTokens().filter(function (t) { return t.dataset.sid === s; });
      return parts.map(function (t) { return t.textContent; }).join(" ").trim();
    }
    function articleTitle() {
      var h = document.querySelector("h1");
      return h ? h.textContent.trim() : (document.title || "");
    }
    function markCurrentWord() {
      var el = currentEl || findCenterWord();
      if (!el) { toast("未定位到当前词"); return; }
      var word = cleanWord(el.textContent);
      if (!word) { toast("当前不是英文单词"); return; }
      var local = loadLocalVocab();
      if (local[word]) { toast("「" + word + "」已在生词表"); highlightWordInPage(word); return; }
      toast("正在标记「" + word + "」…");
      lookup(word).then(function (zh) {
        var local2 = loadLocalVocab();
        if (local2[word]) { toast("「" + word + "」已在生词表"); return; }
        local2[word] = {
          meaning: zh || "待补充",
          ts: Date.now(),
          sentence: currentSentence(),   /* 来源原句 */
          article: articleTitle(),       /* 来源文章标题 */
          date: new Date().toISOString().slice(0, 10), /* 标记日期 YYYY-MM-DD */
        };
        saveLocalVocab(local2);
        var n = highlightWordInPage(word);
        toast("✓ 已标记「" + word + "」" + (zh ? "：" + zh : "") + (n ? "（高亮" + n + "处）" : ""));
      });
    }
    if (vocabBtn) vocabBtn.addEventListener("click", markCurrentWord);

    /* ---- 框选自动翻译浮层 ---- */
    function showFloat(x, y, q, zh) {
      var old = document.getElementById("lexi-float");
      if (old) old.remove();
      var f = document.createElement("div");
      f.id = "lexi-float";
      f.innerHTML = "<strong></strong><span></span>";
      f.querySelector("strong").textContent = q;
      f.querySelector("span").textContent = zh || "(无释义)";
      document.body.appendChild(f);
      var w = f.offsetWidth, h = f.offsetHeight;
      var left = Math.max(8, Math.min(window.innerWidth - w - 8, x));
      var top = y - h - 10;
      if (top < 8) top = y + 16;
      f.style.left = left + "px";
      f.style.top = top + "px";
      clearTimeout(f._t);
      f._t = setTimeout(function () { f.remove(); }, 8000);
    }
    document.addEventListener("mouseup", function (e) {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      var text = sel.toString().trim();
      if (!text) return;
      if (!/[A-Za-z]/.test(text)) return;
      var t = e.target;
      if (t && t.closest && t.closest("#reader-controls, #lexi-float")) return;
      /* 选中内容：优先看是否整段/整句，而非只取首个词。
         若整个选中文本本身就是一个已标记生词 → 直接用本地释义；
         否则整段交给翻译接口（支持短语/句子/多句）。 */
      var single = /^[A-Za-z][A-Za-z'\-]*$/.test(text);
      var q = single ? text.toLowerCase() : text;
      if (single) {
        var meaning = ((loadLocalVocab())[q] || {}).meaning || "";
        if (meaning) { showFloat(e.clientX, e.clientY, q, meaning); return; }
      }
      lookup(q).then(function (zh) { showFloat(e.clientX, e.clientY, q, zh); });
    });

    /* ---- 初始聚焦 ---- */
    showPart(0);
    setTimeout(function () {
      var el = findCenterWord();
      if (el) setFocus(el, {});
    }, 150);

    return { applyMap: applyMap };
  }

  /* ================= 生词管理弹窗 ================= */
  function setupVocabPanel() {
    var modal = document.createElement("div");
    modal.id = "lexi-modal";
    modal.hidden = true;
    modal.innerHTML =
      '<div class="lm-box">' +
      "<h4>本机已标记生词（<span id=\\\"lm-count\\\">0</span>）</h4>" +
      '<p class="lm-hint">点「生词」按钮或框选单词即可标记（自动记录来源原句与日期）。' +
      "本机标记仅存当前浏览器；要把生词同步到全站，请把下方表格复制到本地 <code>Languages/wordDB.md</code> 后运行 <code>deploy.sh</code>。</p>" +
      '<div class="lm-list" id="lm-list"></div>' +
      '<div class="lm-btns"><button id="lm-copy">复制表格行（含来源）</button>' +
      '<button id="lm-clear">清空本机标记</button>' +
      '<button id="lm-close">关闭</button></div>' +
      "</div>";
    document.body.appendChild(modal);

    function entryToRow(w, e) {
      /* 生词 | 释义 | 来源原句 | 日期 */
      var sent = (e.sentence || "").replace(/\|/g, "｜").slice(0, 140);
      return "| " + w + " | " + (e.meaning || "待补充") + " | " + sent + " | " + (e.date || "") + " |";
    }
    function rowsText() {
      var local = loadLocalVocab();
      return Object.keys(local).sort()
        .map(function (w) { return entryToRow(w, local[w]); })
        .join("\n");
    }
    function refresh() {
      var local = loadLocalVocab();
      document.getElementById("lm-count").textContent = Object.keys(local).length;
      var list = document.getElementById("lm-list");
      list.innerHTML = "";
      Object.keys(local).sort().forEach(function (w) {
        var e = local[w];
        var row = document.createElement("div");
        row.className = "lm-row";
        row.innerHTML = "<strong></strong><span class=\"lm-m\"></span><span class=\"lm-s\"></span><span class=\"lm-d\"></span>";
        row.querySelector("strong").textContent = w;
        row.querySelector(".lm-m").textContent = e.meaning || "";
        row.querySelector(".lm-s").textContent = e.sentence || "";
        row.querySelector(".lm-d").textContent = e.date || "";
        list.appendChild(row);
      });
    }
    document.getElementById("lm-copy").addEventListener("click", function () {
      var txt = rowsText();
      if (!txt) { toast("还没有本机标记的词"); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function () { toast("已复制到剪贴板"); });
      } else {
        var ta = document.createElement("textarea");
        ta.value = txt;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
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
    document.getElementById("lm-close").addEventListener("click", function () { modal.hidden = true; });
    modal.addEventListener("click", function (e) { if (e.target === modal) modal.hidden = true; });
    return {
      open: function () { refresh(); modal.hidden = false; },
    };
  }

  /* ================= 生词面板入口（右键控制条上的生词按钮点开） ================= */
  var panel = null;

  /* ================= 启动（兼容 MkDocs instant navigation） ================= */
  function teardown() {
    ["reader-controls", "lexi-modal", "lexi-toast", "lexi-float"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.remove();
    });
    document.body.classList.remove("focus-on");
  }

  var built = false;

  function boot() {
    if (!isArticlePage()) return;
    if (built) { teardown(); built = false; }
    var reader = buildReader();
    if (!reader) return;
    built = true;
    panel = panel || setupVocabPanel();
    /* 生词面板按钮接到控制条（buildReader 已建 #rw-vocab 为标记按钮，这里额外加一个管理入口） */
    var mgr = document.createElement("button");
    mgr.id = "rw-manage";
    mgr.textContent = "管理";
    mgr.title = "查看/导出本机生词";
    mgr.style.cssText = "font-size:12px;padding:4px 8px;border:1px solid rgba(0,0,0,0.22);border-radius:8px;background:transparent;cursor:pointer;";
    mgr.addEventListener("click", function () { panel.open(); });
    var ctl = document.getElementById("reader-controls");
    if (ctl) ctl.appendChild(mgr);

    loadServerVocab().then(function (server) {
      var map = mergeVocab(server);
      reader.applyMap(map);
    });
  }

  /* MkDocs Material instant navigation：每次页面切换后重新 boot */
  function subscribeInstant() {
    if (typeof document$ !== "undefined" && document$ && document$.subscribe) {
      try { document$.subscribe(function () { boot(); }); return true; } catch (e) {}
    }
    return false;
  }

  var ok = subscribeInstant();
  if (!ok) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  }
})();
