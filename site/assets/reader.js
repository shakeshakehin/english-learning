/* ============================================================
 * reader.js —— 文章页功能（v3）：
 *  1. 生词高亮：wordDB.json（全站同步）+ 本机标记（localStorage）合并高亮
 *  2. 聚焦阅读（无障碍）：当前词放大高亮 + 当前句淡背景，其余文字淡化；
 *     页面滚动自动跟随；右侧中间控制条滚轮逐词精细推进
 *  3. 分部分阅读：长文章按句子边界切成若干部分，可翻页跳转
 *  4. 生词标记（支持短语）：点「生词」按钮或框选（单词/短语）→ 统一浮层，
 *     未标记显示翻译+「标记为生词」，已标记显示「✓ 已在生词表」（共用同一弹窗）
 *  5. 翻译改自「句译截取」：整句一次翻译，从句子译文里截取目标词对应片段，
 *     释义带上下文、一词多义正确；浮层同时展示整句中文（辅助理解）
 *  6. 段意自检卡：每段末可折叠「本段大意」（整段中译）——先自己概括再对照
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
  /* 生词条目键：单词或短语统一小写、合并空白 */
  function cleanKey(q) {
    return (q || "").trim().toLowerCase().replace(/\s+/g, " ");
  }
  function articleTitle() {
    var h = document.querySelector("h1");
    return h ? h.textContent.trim() : (document.title || "");
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

  /* ================= 翻译（Google gtx，支持 CORS）================= */
  /* 「从句子的翻译中截取生词释义」：
     把目标词用标记 [[[OPEN]]]词[[[CLOSE]]] 包住再整句翻译，
     标记之间即该词在句中的中文释义（带上下文、一词多义正确），
     去掉标记即整句中文译文。一次请求同时拿到两者。
     返回 { full:整句中文, extracted:该词释义 } 或 null。 */
  var sentCache = {}; /* 请求句 -> 译文缓存（同一句只请求一次） */
  function gtx(q) {
    return fetch(
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=" +
        encodeURIComponent(q),
      { cache: "no-store" }
    )
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j[0]) return "";
        return (j[0] || []).filter(function (x) { return x && x[0]; })
          .map(function (x) { return x[0]; }).join("").trim();
      })
      .catch(function () { return ""; });
  }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function translateSentence(sentenceText, wrapWord) {
    var q = sentenceText;
    var cacheKey = sentenceText;
    if (wrapWord) {
      cacheKey = sentenceText + "\u0001" + wrapWord.toLowerCase();
      var re = new RegExp("(" + escRe(wrapWord) + ")", "i");
      q = sentenceText.replace(re, "[[[OPEN]]]$1[[[CLOSE]]]");
    }
    if (sentCache[cacheKey]) return Promise.resolve(sentCache[cacheKey]);
    return gtx(q).then(function (full) {
      var out = { full: full, extracted: "" };
      if (wrapWord) {
        var m = full.match(/\[\[\[OPEN\]\]\](.*?)\[\[\[CLOSE\]\]\]/);
        if (m) {
          out.extracted = m[1].trim();
          out.full = full.replace(/\[\[\[(?:OPEN|CLOSE)\]\]]/g, "").trim();
        }
      }
      sentCache[cacheKey] = out;
      return out;
    });
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
  /* 标记短语后：按词序在连续 token 上找匹配序列并高亮（best-effort） */
  function highlightPhraseInPage(phrase) {
    var words = cleanKey(phrase).split(" ").map(cleanWord).filter(Boolean);
    if (!words.length) return 0;
    var spans = Array.prototype.slice.call(document.querySelectorAll(".md-content .rw"));
    var hit = 0, i = 0;
    while (i < spans.length) {
      var j = 0, k = i;
      while (k < spans.length && j < words.length &&
             cleanWord(spans[k].textContent) === words[j]) {
        k++; j++;
      }
      if (j === words.length) {
        for (var m = i; m < k; m++) {
          if (!spans[m].classList.contains("vocab")) { spans[m].classList.add("vocab"); hit++; }
        }
        i = k;
      } else { i++; }
    }
    return hit;
  }
  /* 统一的「已标记」状态标签 */
  function markedSpan() {
    var s = document.createElement("span");
    s.className = "lf-status";
    s.textContent = "✓ 已在生词表";
    return s;
  }
  /* 统一的生词入库逻辑：写 localStorage + 同步 + 页面高亮 */
  function addVocabEntry(key, display, zh, sentence, fullTrans) {
    var local = loadLocalVocab();
    if (local[key]) return { ok: false, reason: "exists" };
    local[key] = {
      meaning: zh || "待补充",
      sentTrans: fullTrans || "",
      ts: Date.now(),
      sentence: sentence || "",
      article: articleTitle(),
      date: new Date().toISOString().slice(0, 10),
    };
    saveLocalVocab(local);
    if (window.SyncVocab) {
      window.SyncVocab.push(key, local[key]).catch(function () {});
    }
    var n = display.indexOf(" ") < 0 ? highlightWordInPage(cleanKey(display)) : highlightPhraseInPage(display);
    return { ok: true, highlight: n };
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

    /* ---- 段意自检卡：每段末一个可折叠「本段大意」----
       流程：先自己用中文/英文一句话概括这段，再点开对照整句/整段译文。
       译文由 Google 整段翻译提供（复用句子缓存）。 */
    var gistCards = [];
    content.querySelectorAll("p").forEach(function (p) {
      var card = document.createElement("div");
      card.className = "pgist";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pgist-t";
      btn.textContent = "本段大意 · 先自己概括，再展开对照";
      var body = document.createElement("div");
      body.className = "pgist-b";
      body.hidden = true;
      card.appendChild(btn);
      card.appendChild(body);
      if (p.nextSibling) p.parentNode.insertBefore(card, p.nextSibling);
      else p.parentNode.appendChild(card);
      var text = (p.textContent || "").replace(/\s+/g, " ").trim();
      btn.addEventListener("click", function () {
        var open = body.hidden;
        if (open && !body.dataset.loaded) {
          body.dataset.loaded = "1";
          body.textContent = "翻译中…";
          function render() {
            body.textContent = (sentCache[text] && sentCache[text].full) || "(未能获取大意)";
          }
          if (sentCache[text]) render();
          else translateSentence(text).then(render);
        }
        body.hidden = !open;
        btn.classList.toggle("open", !open);
      });
      gistCards.push({ p: p, card: card });
    });

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
      /* 段意卡跟随：只显示当前部分所属段落的卡 */
      gistCards.forEach(function (gc) {
        var inPart = parts[curPart].some(function (t) { return gc.p.contains(t); });
        gc.card.style.display = inPart ? "" : "none";
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
    function markCurrentWord() {
      var el = currentEl || findCenterWord();
      if (!el) { toast("未定位到当前词"); return; }
      var word = cleanWord(el.textContent);
      if (!word) { toast("当前不是英文单词"); return; }
      var key = cleanKey(word);
      var sent = currentSentence();
      var local = loadLocalVocab();
      if (local[key]) {
        /* 已标记：直接显示已标记卡片（与未标记共用同一弹窗） */
        showCardNear(el, word, local[key].meaning || "", true, { sentence: sent });
        return;
      }
      toast("正在翻译所在句…");
      translateSentence(sent, word).then(function (tr) {
        var zh = tr ? (tr.extracted || tr.full) : "";
        showCardNear(el, word, zh, false, { sentence: sent, fullTrans: tr ? tr.full : "" });
      });
    }
    if (vocabBtn) vocabBtn.addEventListener("click", markCurrentWord);

    /* ---- 统一翻译/标记浮层（词/短语卡片）----
       新标记与已标记共用同一弹窗：未标记显示翻译+「标记为生词」，
       已标记显示「✓ 已在生词表」。停留 20s，悬停不消失，可点 × 关闭。 */
    function showCardNear(anchorEl, q, zh, already, info) {
      showCard(anchorEl.getBoundingClientRect(), q, zh, already, info);
    }
    function showCard(rect, q, zh, already, info) {
      info = info || {};
      var old = document.getElementById("lexi-float");
      if (old) old.remove();
      var f = document.createElement("div");
      f.id = "lexi-float";
      var html = '<button class="lf-close" type="button" title="关闭">×</button>' +
        "<strong></strong><span class=\"lf-zh\"></span>";
      if (info.fullTrans) html += '<div class="lf-sent"></div>';
      html += '<div class="lf-foot"></div>';
      f.innerHTML = html;
      f.querySelector("strong").textContent = q;
      f.querySelector(".lf-zh").textContent = zh || "(无释义)";
      if (info.fullTrans) f.querySelector(".lf-sent").textContent = info.fullTrans;
      var foot = f.querySelector(".lf-foot");
      var key = cleanKey(q);
      var local = loadLocalVocab();
      var marked = already || !!local[key];
      if (marked) {
        foot.appendChild(markedSpan());
      } else {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "lf-mark";
        btn.textContent = "标记为生词";
        btn.addEventListener("click", function () {
          var res = addVocabEntry(key, q, zh, info.sentence || "", info.fullTrans || "");
          if (res.ok) {
            btn.replaceWith(markedSpan());
            f.querySelector(".lf-zh").textContent = zh || "待补充";
            toast("✓ 已标记「" + q + "」" + (res.highlight ? "（高亮" + res.highlight + "处）" : ""));
          } else {
            toast("「" + q + "」已在生词表");
            btn.replaceWith(markedSpan());
          }
        });
        foot.appendChild(btn);
      }
      document.body.appendChild(f);
      var w = f.offsetWidth, h = f.offsetHeight;
      var x = rect.left + (rect.width ? rect.width / 2 : 0);
      var y = rect.top;
      var left = Math.max(8, Math.min(window.innerWidth - w - 8, x));
      var top = y - h - 10;
      if (top < 8) top = y + (rect.height || 16) + 8;
      f.style.left = left + "px";
      f.style.top = top + "px";
      clearTimeout(f._t);
      function schedule() { f._t = setTimeout(function () { f.remove(); }, 20000); }
      schedule();
      f.addEventListener("mouseenter", function () { clearTimeout(f._t); });
      f.addEventListener("mouseleave", schedule);
      f.querySelector(".lf-close").addEventListener("click", function () { f.remove(); });
    }
    /* 框选所在句：从选中锚点向上找 .rw token 取其句子原文 */
    function selectionSentence() {
      var sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return "";
      var node = sel.anchorNode;
      var span = (node && node.nodeType === 3) ? node.parentElement : node;
      if (span && span.closest) span = span.closest(".rw");
      if (span && span.dataset && span.dataset.sid && _sidText && _sidText[span.dataset.sid]) {
        return _sidText[span.dataset.sid].trim();
      }
      return "";
    }
    document.addEventListener("mouseup", function (e) {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      var text = sel.toString().trim();
      if (!text) return;
      if (!/[A-Za-z]/.test(text)) return;
      var t = e.target;
      if (t && t.closest && t.closest("#reader-controls, #lexi-float")) return;
      var rect;
      try { rect = sel.getRangeAt(0).getBoundingClientRect(); } catch (err) { return; }
      var key = cleanKey(text);
      var local = loadLocalVocab();
      var marked = !!local[key];
      var sent = selectionSentence();
      /* 整句翻译（把选中片段用标记包裹），截取选中片段的中文释义；
         已标记则直接显示本地释义。 */
      translateSentence(sent, text).then(function (tr) {
        var zh = marked ? (local[key].meaning || "") : (tr ? (tr.extracted || tr.full) : "");
        showCard(rect, text, zh, marked, { sentence: sent, fullTrans: tr ? tr.full : "" });
      });
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
