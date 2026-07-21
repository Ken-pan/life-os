#!/usr/bin/env python3
"""Zero-dep static SPA server for Kenos Daily Beta (LAN-safe on macOS).

Node http on LAN self-IP is broken by Application Firewall on this Mac;
Python's http.server accepts phone + hairpin correctly.

Env:
  KENOS_STATIC_ROOT, KENOS_STATIC_PORT, KENOS_STATIC_APP, KENOS_RELEASE_META
  KENOS_STATIC_BIND — default 0.0.0.0
"""
from __future__ import annotations

import json
import mimetypes
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(os.environ.get("KENOS_STATIC_ROOT", "")).resolve()
PORT = int(os.environ.get("KENOS_STATIC_PORT", "0") or "0")
APP = os.environ.get("KENOS_STATIC_APP", "app")
META_PATH = os.environ.get("KENOS_RELEASE_META", "")
BIND = os.environ.get("KENOS_STATIC_BIND", "0.0.0.0")

if not ROOT.is_dir() or PORT <= 0:
    print("KENOS_STATIC_ROOT and KENOS_STATIC_PORT are required", file=sys.stderr)
    sys.exit(1)


def release_payload() -> dict:
    meta = {
        "app": APP,
        "environment": "local-daily-beta",
        "port": PORT,
        "root": str(ROOT),
        "server": "python-static",
    }
    if META_PATH and Path(META_PATH).is_file():
        try:
            meta.update(json.loads(Path(META_PATH).read_text(encoding="utf-8")))
        except Exception:
            pass
    return meta


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path == "/__health":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"ok")
            return
        if path == "/__kenos/release":
            body = json.dumps(release_payload()).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        # SPA fallback: missing file → index.html
        rel = path.lstrip("/") or "index.html"
        candidate = (ROOT / rel).resolve()
        try:
            candidate.relative_to(ROOT)
        except ValueError:
            self.send_error(403)
            return
        if candidate.is_dir():
            candidate = candidate / "index.html"
        if not candidate.is_file():
            candidate = ROOT / "index.html"
        if not candidate.is_file():
            self.send_error(404)
            return

        data = candidate.read_bytes()
        ctype = mimetypes.guess_type(str(candidate))[0] or "application/octet-stream"
        if candidate.suffix == ".js":
            ctype = "text/javascript; charset=utf-8"
        elif candidate.suffix == ".css":
            ctype = "text/css; charset=utf-8"
        elif candidate.suffix == ".html":
            ctype = "text/html; charset=utf-8"
        immutable = "/_app/immutable/" in str(candidate)
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header(
            "Cache-Control",
            "public, max-age=31536000, immutable" if immutable else "no-cache",
        )
        self.end_headers()
        self.wfile.write(data)


class Server(ThreadingHTTPServer):
    allow_reuse_address = True


def main() -> None:
    httpd = Server((BIND, PORT), Handler)
    print(f"[kenos-static:{APP}] {ROOT} → http://{BIND}:{PORT}", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
