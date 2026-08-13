/* ============================================================
 * sync.js —— 本地生词双向同步客户端（方案 A）
 * 真相源：本地文件 <vault>/Languages/local_vocab.json，由本地服务 sync_server.py 读写。
 * 网页端（localStorage）只作当前会话缓存；打开生词表 / 标记时与本地双向合并。
 * 依赖：本地服务 http://127.0.0.1:8790（未启动时静默降级为纯本地，标记不丢，仅不同步）
 * ============================================================ */
(function () {
  "use strict";
  var SYNC_URL = "http://127.0.0.1:8790";

  function available() {
    /* 页面加载后探测一次服务是否可达 */
    return fetch(SYNC_URL + "/vocab", { cache: "no-store" })
      .then(function (r) { return r.ok; })
      .catch(function () { return false; });
  }

  /* 推送一条：{word, entry} -> 本地词库文件 */
  function push(word, entry) {
    return fetch(SYNC_URL + "/vocab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: word, entry: entry }),
    }).then(function (r) { return r.ok; }).catch(function () { return false; });
  }

  /* 拉取本地整个词库 -> Promise<map|null>（null 表示服务不可达） */
  function pull() {
    return fetch(SYNC_URL + "/vocab", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && j.words ? j.words : null; })
      .catch(function () { return null; });
  }

  /* 整体合并推送一个 map 到本地 */
  function pushAll(map) {
    return fetch(SYNC_URL + "/vocab/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ words: map }),
    }).then(function (r) { return r.ok; }).catch(function () { return false; });
  }

  /* 完整双向同步：
   *   1. 拉取本地词库（真相源）
   *   2. 以本地为准合并，同时把 localStorage 里本地没有的词也保留并推上去
   *   3. 返回合并后的 map（可用来渲染 / 覆盖 localStorage）
   * 若本地服务不可达：返回 {merged: null, reason: "offline"}，调用方退回纯本地。 */
  function fullSync(localMap) {
    return pull().then(function (remote) {
      if (!remote) return { merged: null, reason: "offline" };
      var merged = {};
      var toPush = {};
      Object.keys(remote).forEach(function (w) { merged[w] = remote[w]; });
      Object.keys(localMap || {}).forEach(function (w) {
        if (!merged[w]) { merged[w] = localMap[w]; toPush[w] = localMap[w]; }
      });
      var p = Object.keys(toPush).length
        ? pushAll(toPush).catch(function () { return false; })
        : Promise.resolve(true);
      return p.then(function () { return { merged: merged, reason: "ok" }; });
    });
  }

  window.SyncVocab = {
    url: SYNC_URL,
    available: available,
    push: push,
    pull: pull,
    pushAll: pushAll,
    fullSync: fullSync,
  };
})();
