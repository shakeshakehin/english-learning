#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
sync_server.py —— 本地生词双向同步服务（方案 A）
真相源：<vault>/Languages/local_vocab.json（网页标记的生词，含原句/来源/日期）
角色：
  GET  /vocab             -> 返回本地词库整个 map（网页打开生词表时拉取 = "从本地上传"）
  POST /vocab             -> 合并写入一条 {word, entry}（网页标记时推送 = "同步到本地"）
  POST /vocab/merge       -> 整体合并一个 map（网页上传本地没有的散词）
监听 127.0.0.1:8790，开 CORS，支持 https 线上页跨域访问 localhost。
用法：python sync_server.py [port]
"""
import json
import os
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_PORT = 8790
HOST = "127.0.0.1"

# vault 根目录（本脚本位于 vault 根，故取一次 dirname）
VAULT = os.path.dirname(os.path.abspath(__file__))
LANG_DIR = os.path.join(VAULT, "Languages")
STORE = os.path.join(LANG_DIR, "local_vocab.json")


def load_store():
    if not os.path.exists(STORE):
        return {}
    try:
        with open(STORE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_store(map_):
    os.makedirs(LANG_DIR, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=LANG_DIR, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(map_, f, ensure_ascii=False, indent=1)
        os.replace(tmp, STORE)  # 原子写，避免并发损坏
    except Exception:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length <= 0:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            return {}

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/vocab":
            self._json(200, {"ok": True, "words": load_store()})
        else:
            self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        path = self.path.split("?")[0]
        data = self._body()
        store = load_store()
        if path == "/vocab":
            word = data.get("word")
            entry = data.get("entry")
            if not word or not isinstance(entry, dict):
                self._json(400, {"ok": False, "error": "need word + entry"})
                return
            store[word] = entry
            save_store(store)
            self._json(200, {"ok": True, "count": len(store)})
        elif path == "/vocab/merge":
            words = data.get("words")
            if not isinstance(words, dict):
                self._json(400, {"ok": False, "error": "need words map"})
                return
            merged = 0
            for w, e in words.items():
                if isinstance(e, dict):
                    store[w] = e
                    merged += 1
            save_store(store)
            self._json(200, {"ok": True, "merged": merged, "count": len(store)})
        else:
            self._json(404, {"ok": False, "error": "not found"})


def main():
    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    server = ThreadingHTTPServer((HOST, port), Handler)
    print(f"本地生词同步服务已启动: http://{HOST}:{port}/vocab")
    print(f"词库文件: {STORE}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    main()
