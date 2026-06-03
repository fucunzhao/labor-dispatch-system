"""劳务中介智能客户服务系统 MVP — 主入口"""
import json
import os
import re
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
from io import BytesIO
import cgi

from db import DB_PATH, init_db, connect
from auth import get_account_from_headers, check_role, require_login, SMS_PROVIDER, SMS_SECRET_ID, SMS_SECRET_KEY, SMS_SDK_APP_ID, SMS_TEMPLATE_ID, SMS_SIGN, MAX_UPLOAD_BYTES
from data import get_payload
from routes_accounts import (
    handle_accounts_list, handle_register, handle_login,
    handle_send_code, handle_reset_password, handle_change_password,
    handle_profile_update,
)
from routes_business import (
    handle_get_data, handle_get_pipeline, handle_get_pipeline_list,
    handle_post_demands, handle_post_workers,
    handle_post_fuzzy_parse, handle_post_fuzzy_import,
    handle_post_pipeline_assign, handle_post_pipeline_status,
    handle_post_knowledge_save, handle_post_knowledge_delete,
    handle_post_knowledge_batch_delete, handle_post_knowledge_batch_update,
    handle_post_knowledge_rebuild, handle_chat, handle_reset,
    insert_demand,
)
from fuzzy import parse_fuzzy_workers, parse_fuzzy_demands, extract_uploaded_text, extract_xlsx_text, parse_xlsx_demands, parse_xlsx_workers
from knowledge import sync_knowledge_entries


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    _STATIC_ALLOWLIST = {
        "/", "/index.html", "/applicant.html",
        "/app.js", "/applicant.js", "/styles.css",
        "/favicon.ico",
    }

    def do_GET(self):
        parsed = urlparse(self.path)
        account = get_account_from_headers(self.headers)
        path = parsed.path

        if path == "/api/data":
            handle_get_data(self, account)
        elif path == "/api/accounts/list":
            handle_accounts_list(self, account)
        elif path == "/api/pipeline":
            handle_get_pipeline(self, account)
        elif path == "/api/pipeline/list":
            handle_get_pipeline_list(self, account)
        elif path not in self._STATIC_ALLOWLIST:
            self.send_response(404)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write("Not Found".encode("utf-8"))
        else:
            if path == "/":
                self.path = "/index.html"
            super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        account = get_account_from_headers(self.headers)
        path = parsed.path

        if path == "/api/auth/send-code":
            handle_send_code(self, self.read_json())
        elif path == "/api/auth/register":
            handle_register(self, self.read_json())
        elif path == "/api/auth/login":
            handle_login(self, self.read_json())
        elif path == "/api/auth/reset-password":
            handle_reset_password(self, self.read_json())
        elif path == "/api/auth/change-password":
            handle_change_password(self, account, self.read_json())
        elif path == "/api/profile/update":
            handle_profile_update(self, account, self.read_json())
        elif path == "/api/demands":
            handle_post_demands(self, account, self.read_json())
        elif path == "/api/workers":
            handle_post_workers(self, account, self.read_json())
        elif path == "/api/fuzzy/parse":
            handle_post_fuzzy_parse(self, self.read_json())
        elif path == "/api/fuzzy/file":
            self._handle_fuzzy_file(account)
        elif path == "/api/fuzzy/import":
            handle_post_fuzzy_import(self, account, self.read_json())
        elif path == "/api/pipeline/assign":
            handle_post_pipeline_assign(self, account, self.read_json())
        elif path == "/api/pipeline/status":
            handle_post_pipeline_status(self, account, self.read_json())
        elif path == "/api/knowledge/save":
            handle_post_knowledge_save(self, account, self.read_json())
        elif path == "/api/knowledge/delete":
            handle_post_knowledge_delete(self, account, self.read_json())
        elif path == "/api/knowledge/batch-delete":
            handle_post_knowledge_batch_delete(self, account, self.read_json())
        elif path == "/api/knowledge/batch-update":
            handle_post_knowledge_batch_update(self, account, self.read_json())
        elif path == "/api/knowledge/rebuild":
            handle_post_knowledge_rebuild(self, account)
        elif path == "/api/chat":
            handle_chat(self, account, self.read_json())
        elif path == "/api/reset":
            handle_reset(self, account)
        else:
            self.send_json({"ok": False, "error": "未知接口"}, status=404)

    def _handle_fuzzy_file(self, account):
        try:
            form = self.read_multipart()
            kind = form.get("kind", "demand")
            filename = form.get("filename", "")
            raw = form.get("file", b"")
            if not raw:
                self.send_json({"ok": False, "error": "没有收到文件"}, status=400)
                return
            suffix = Path(filename or "").suffix.lower()
            if suffix == ".xlsx":
                rows = extract_xlsx_text(raw)
                if kind == "worker":
                    items = parse_xlsx_workers(rows)
                else:
                    items = parse_xlsx_demands(rows)
                if items is not None:
                    total = max(len(rows) - 1, 0)
                    truncated = total > len(items)
                    self.send_json({"ok": True, "items": items, "filename": filename, "totalRows": total, "truncated": truncated, "returnedCount": len(items)})
                    return
            text = extract_uploaded_text(filename, raw)
            if not text.strip():
                self.send_json({"ok": False, "error": "文件内容为空或无法提取文字"}, status=400)
                return
            items = parse_fuzzy_workers(text) if kind == "worker" else parse_fuzzy_demands(text)
            self.send_json({"ok": True, "items": items, "text": text[:20000], "filename": filename})
        except Exception as exc:
            self.send_json({"ok": False, "error": str(exc)}, status=400)

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8"))

    def read_multipart(self):
        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            return {}
        _, pdict = cgi.parse_header(content_type)
        pdict["boundary"] = pdict.get("boundary", "").encode("utf-8")
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        form = {}
        if hasattr(cgi, "parse_multipart"):
            parts = cgi.parse_multipart(BytesIO(raw), pdict)
            for key, values in parts.items():
                if key == "file" and values:
                    form[key] = values[0]
                elif values:
                    form[key] = values[0].decode("utf-8") if isinstance(values[0], bytes) else values[0]
        return form

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {args[0]} {args[1]} {args[2]}")


if __name__ == "__main__":
    init_db()
    print(f"数据库路径：{DB_PATH}")
    port = int(os.environ.get("PORT", 8080))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"劳务中介系统已启动：http://127.0.0.1:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止")
        server.server_close()
