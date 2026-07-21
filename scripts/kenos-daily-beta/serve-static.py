#!/usr/bin/env python3
"""Zero-dep static SPA server for Kenos Daily Beta (LAN / Tailscale-safe on macOS).

Node http on LAN self-IP is broken by Application Firewall on this Mac;
Python's http.server accepts phone + hairpin correctly.

Env:
  KENOS_STATIC_ROOT, KENOS_STATIC_PORT, KENOS_STATIC_APP, KENOS_RELEASE_META
  KENOS_STATIC_BIND — default 0.0.0.0
  KENOS_LOCALAI_UPSTREAM — default http://127.0.0.1:18888
  KENOS_LOCALAI_PROXY — default 1 (same-origin /__localai → upstream)
  KENOS_DEVICE_TRUST — path to device-trust.json (peer allowlist)
  KENOS_LOCALAI_ALLOW_LAN — 1 to allow RFC1918 + CGNAT (weaker; doctor warns)
  KENOS_LOCALAI_PROXY_TOKEN — optional Bearer for curl/smoke (never shipped to JS)
  KENOS_LOCALAI_MAX_INFLIGHT — default 2 (POST chat/completions slots)
  KENOS_LOCALAI_MAX_BODY — default 33554432 (32 MiB)
  KENOS_LOCALAI_SSE_PING_S — default 2 (SSE comment keepalive while upstream silent)
"""
from __future__ import annotations

import http.client
import ipaddress
import json
import mimetypes
import os
import select
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse, urlsplit

ROOT = Path(os.environ.get("KENOS_STATIC_ROOT", "")).resolve()
PORT = int(os.environ.get("KENOS_STATIC_PORT", "0") or "0")
APP = os.environ.get("KENOS_STATIC_APP", "app")
META_PATH = os.environ.get("KENOS_RELEASE_META", "")
BIND = os.environ.get("KENOS_STATIC_BIND", "0.0.0.0")
LOCALAI_UPSTREAM = os.environ.get("KENOS_LOCALAI_UPSTREAM", "http://127.0.0.1:18888").rstrip(
    "/"
)
LOCALAI_PROXY = os.environ.get("KENOS_LOCALAI_PROXY", "1") != "0"
LOCALAI_PREFIX = "/__localai"
TRUST_PATH = Path(
    os.environ.get("KENOS_DEVICE_TRUST")
    or (Path.home() / ".kenos-daily-beta" / "device-trust.json")
).expanduser()
ALLOW_LAN = os.environ.get("KENOS_LOCALAI_ALLOW_LAN", "0") == "1"
PROXY_TOKEN = (os.environ.get("KENOS_LOCALAI_PROXY_TOKEN") or "").strip()
MAX_INFLIGHT = max(1, int(os.environ.get("KENOS_LOCALAI_MAX_INFLIGHT", "2") or "2"))
MAX_BODY = max(1024, int(os.environ.get("KENOS_LOCALAI_MAX_BODY", str(32 * 1024 * 1024)) or 0))
SSE_PING_S = max(0.5, float(os.environ.get("KENOS_LOCALAI_SSE_PING_S", "2") or "2"))
SSE_READ_CHUNK = max(512, int(os.environ.get("KENOS_LOCALAI_SSE_READ_CHUNK", "4096") or "4096"))
# Same-origin QA beacons (SSO Continuity smoke) — avoids ATS / cross-port :5299.
BEACON_DIR = Path(
    os.environ.get("KENOS_BEACON_DIR")
    or (Path.home() / ".kenos-daily-beta" / "beacons")
).resolve()

if not ROOT.is_dir() or PORT <= 0:
    print("KENOS_STATIC_ROOT and KENOS_STATIC_PORT are required", file=sys.stderr)
    sys.exit(1)

_HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
}

_CHAT_SLOT = threading.Semaphore(MAX_INFLIGHT)
_TRUST_LOCK = threading.Lock()
_TRUST_CACHE: dict = {"mtime": None, "at": 0.0, "ips": set()}


def release_payload() -> dict:
    meta = {
        "app": APP,
        "environment": "local-daily-beta",
        "port": PORT,
        "root": str(ROOT),
        "server": "python-static",
        "localaiProxy": LOCALAI_PROXY,
        "localaiPrefix": LOCALAI_PREFIX if LOCALAI_PROXY else None,
        "localaiAllowLan": ALLOW_LAN,
        "localaiMaxInflight": MAX_INFLIGHT,
        "localaiMaxBody": MAX_BODY,
        "deviceTrust": str(TRUST_PATH) if LOCALAI_PROXY else None,
    }
    if META_PATH and Path(META_PATH).is_file():
        try:
            meta.update(json.loads(Path(META_PATH).read_text(encoding="utf-8")))
        except Exception:
            pass
    return meta


def _upstream_parts():
    parts = urlsplit(LOCALAI_UPSTREAM)
    host = parts.hostname or "127.0.0.1"
    port = parts.port or (443 if parts.scheme == "https" else 80)
    return parts.scheme or "http", host, port


def _normalize_client_ip(raw: str) -> str:
    host = (raw or "").strip()
    if host.startswith("::ffff:"):
        host = host[7:]
    if host.startswith("[") and host.endswith("]"):
        host = host[1:-1]
    return host


def _is_loopback(ip: str) -> bool:
    try:
        return ipaddress.ip_address(ip).is_loopback
    except ValueError:
        return ip in {"127.0.0.1", "::1", "localhost"}


def _is_private_or_cgnat(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    if addr.is_private or addr.is_loopback:
        return True
    # Tailscale CGNAT 100.64.0.0/10
    if isinstance(addr, ipaddress.IPv4Address):
        return ipaddress.IPv4Address("100.64.0.0") <= addr <= ipaddress.IPv4Address(
            "100.127.255.255"
        )
    return False


def _load_trust_ips() -> set[str]:
    now = time.time()
    with _TRUST_LOCK:
        try:
            mtime = TRUST_PATH.stat().st_mtime if TRUST_PATH.is_file() else None
        except OSError:
            mtime = None
        if (
            _TRUST_CACHE["ips"]
            and _TRUST_CACHE["mtime"] == mtime
            and now - float(_TRUST_CACHE["at"]) < 30
        ):
            return set(_TRUST_CACHE["ips"])
        ips: set[str] = set()
        if TRUST_PATH.is_file():
            try:
                data = json.loads(TRUST_PATH.read_text(encoding="utf-8"))
                for key in ("mac", "phone"):
                    node = data.get(key) or {}
                    v4 = node.get("ipv4")
                    if isinstance(v4, str) and v4.strip():
                        ips.add(v4.strip())
            except Exception:
                pass
        _TRUST_CACHE["mtime"] = mtime
        _TRUST_CACHE["at"] = now
        _TRUST_CACHE["ips"] = set(ips)
        return ips


def _bearer_ok(headers) -> bool:
    if not PROXY_TOKEN:
        return False
    auth = headers.get("Authorization") or headers.get("authorization") or ""
    if auth.lower().startswith("bearer ") and auth[7:].strip() == PROXY_TOKEN:
        return True
    alt = headers.get("X-Kenos-Proxy-Token") or headers.get("x-kenos-proxy-token") or ""
    return alt.strip() == PROXY_TOKEN


def client_allowed(client_ip: str, headers) -> bool:
    ip = _normalize_client_ip(client_ip)
    if _bearer_ok(headers):
        return True
    if _is_loopback(ip):
        return True
    if ip in _load_trust_ips():
        return True
    if ALLOW_LAN and _is_private_or_cgnat(ip):
        return True
    return False


def _normalize_proxy_path(rest: str) -> str | None:
    """Fixed-upstream path only — reject scheme / host escape / .."""
    if not rest:
        rest = "/"
    if not rest.startswith("/"):
        rest = "/" + rest
    if rest.startswith("//"):
        return None
    lower = rest.lower()
    if "://" in lower or lower.startswith("/http:") or lower.startswith("/https:"):
        return None
    parts = []
    for seg in rest.split("/"):
        if seg in ("", "."):
            continue
        if seg == "..":
            return None
        parts.append(seg)
    return "/" + "/".join(parts)


def _uses_chat_slot(method: str, target_path: str) -> bool:
    if method.upper() != "POST":
        return False
    path_only = target_path.split("?", 1)[0]
    return path_only.endswith("/chat/completions") or path_only.endswith("/completions")


def _probe_localai_models(timeout: float = 1.5) -> tuple[bool, str]:
    scheme, host, port = _upstream_parts()
    try:
        if scheme == "https":
            conn = http.client.HTTPSConnection(host, port, timeout=timeout)
        else:
            conn = http.client.HTTPConnection(host, port, timeout=timeout)
        conn.request("GET", "/v1/models", headers={"Connection": "close"})
        res = conn.getresponse()
        body = res.read(256)
        conn.close()
        if res.status == 200:
            return True, "ok"
        return False, f"upstream_{res.status}"
    except Exception as err:
        return False, str(err)


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def handle(self) -> None:
        # WKWebView opens many parallel connections; client resets are normal.
        try:
            super().handle()
        except (ConnectionResetError, BrokenPipeError, TimeoutError):
            pass

    def handle_one_request(self) -> None:
        try:
            super().handle_one_request()
        except (ConnectionResetError, BrokenPipeError, TimeoutError):
            self.close_connection = True

    def _send_plain(self, code: int, msg: str, extra: dict | None = None) -> None:
        body = msg.encode("utf-8")
        try:
            self.send_response(code)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            if extra:
                for k, v in extra.items():
                    self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body)
        except (ConnectionResetError, BrokenPipeError, TimeoutError):
            self.close_connection = True

    def _try_localai_proxy(self) -> bool:
        if not LOCALAI_PROXY:
            return False
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path != LOCALAI_PREFIX and not path.startswith(LOCALAI_PREFIX + "/"):
            return False

        client_ip = self.client_address[0] if self.client_address else ""
        if not client_allowed(client_ip, self.headers):
            self._send_plain(
                403,
                "localai_proxy_forbidden: peer not in device-trust allowlist",
            )
            return True

        rest = path[len(LOCALAI_PREFIX) :] or "/"
        norm = _normalize_proxy_path(rest)
        if norm is None:
            self._send_plain(400, "localai_proxy_bad_path")
            return True
        target_path = norm + (("?" + parsed.query) if parsed.query else "")

        length = int(self.headers.get("Content-Length") or "0")
        if length > MAX_BODY:
            self._send_plain(413, "localai_proxy_body_too_large")
            return True

        use_slot = _uses_chat_slot(self.command, target_path)
        got_slot = False
        if use_slot:
            got_slot = _CHAT_SLOT.acquire(blocking=False)
            if not got_slot:
                self._send_plain(
                    429,
                    "localai_proxy_busy: max concurrent chat reached",
                    {"Retry-After": "2"},
                )
                return True

        body = self.rfile.read(length) if length > 0 else None

        scheme, host, port = _upstream_parts()
        try:
            conn: http.client.HTTPConnection
            if scheme == "https":
                conn = http.client.HTTPSConnection(host, port, timeout=600)
            else:
                conn = http.client.HTTPConnection(host, port, timeout=600)
            headers = {
                k: v
                for k, v in self.headers.items()
                if k.lower() not in _HOP_BY_HOP
            }
            headers["Host"] = f"{host}:{port}" if port not in (80, 443) else host
            # Avoid keep-alive pile-up between Daily Beta proxy and llama-swap
            # (wedged mlx workers accumulate ESTABLISHED fds under phone load).
            headers["Connection"] = "close"
            conn.request(self.command, target_path, body=body, headers=headers)
            upstream = conn.getresponse()
        except Exception as err:
            if got_slot:
                _CHAT_SLOT.release()
            self._send_plain(502, f"localai_proxy_upstream_error: {err}")
            return True

        try:
            self.send_response(upstream.status)
            content_type = ""
            for key, value in upstream.getheaders():
                if key.lower() in _HOP_BY_HOP:
                    continue
                if key.lower() == "content-type":
                    content_type = value
                self.send_header(key, value)
            self.send_header("Connection", "close")
            is_sse = (
                "text/event-stream" in content_type.lower()
                or "event-stream" in content_type.lower()
            )
            if is_sse:
                self.send_header("Cache-Control", "no-cache")
                self.send_header("X-Accel-Buffering", "no")
            # SSE / long chat: disable Nagle-ish buffering on the phone path.
            self.end_headers()
            # Phone WKWebView / Tailscale: keep the SSE socket warm while 35B
            # prefills (TTFT can be multi-second). Comment lines are ignored by
            # OpenAI stream parsers but reset idle timers.
            sock = getattr(upstream, "fp", None)
            sock = getattr(sock, "raw", sock)
            sock = getattr(sock, "_sock", sock)
            while True:
                if is_sse and sock is not None:
                    try:
                        ready, _, _ = select.select([sock], [], [], SSE_PING_S)
                    except (TypeError, ValueError, OSError):
                        ready = [sock]
                    if not ready:
                        try:
                            self.wfile.write(b": ping\n\n")
                            self.wfile.flush()
                        except Exception:
                            break
                        continue
                    chunk = upstream.read(SSE_READ_CHUNK)
                else:
                    chunk = upstream.read(16384)
                if not chunk:
                    break
                self.wfile.write(chunk)
                try:
                    self.wfile.flush()
                except Exception:
                    pass
        except (ConnectionResetError, BrokenPipeError, TimeoutError):
            self.close_connection = True
        finally:
            try:
                conn.close()
            except Exception:
                pass
            if got_slot:
                _CHAT_SLOT.release()
        return True

    def do_GET(self) -> None:  # noqa: N802
        if self._try_localai_proxy():
            return
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        # When proxy is off, do not SPA-fallback /__localai → index.html (looks like 200).
        if path == LOCALAI_PREFIX or path.startswith(LOCALAI_PREFIX + "/"):
            self._send_plain(404, "localai_proxy_disabled")
            return
        if path == "/__health":
            qs = parsed.query or ""
            deep = any(p == "deep=1" or p.startswith("deep=1&") for p in qs.split("&")) or (
                "deep=1" in qs
            )
            if deep:
                ok, detail = _probe_localai_models()
                if ok:
                    self._send_plain(200, "ok")
                else:
                    self._send_plain(503, f"localai_deep_fail: {detail}")
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(b"ok")
            return
        if path == "/__kenos/release":
            body = json.dumps(release_payload()).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
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
            # Missing immutable assets must 404 — never SPA-fallback JS/CSS
            # (fallback HTML parsed as JS → blank UI / confusing client errors).
            if path.startswith("/_app/") or path.startswith("/assets/"):
                self.send_error(404)
                return
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
        try:
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header(
                "Cache-Control",
                "public, max-age=31536000, immutable" if immutable else "no-cache",
            )
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(data)
        except (ConnectionResetError, BrokenPipeError, TimeoutError):
            self.close_connection = True

    def _handle_kenos_beacon(self) -> bool:
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path != "/__kenos_beacon" and not path.startswith("/__kenos_beacon/"):
            return False
        length = int(self.headers.get("Content-Length") or "0")
        if length <= 0 or length > 64_000:
            self.send_error(400, "bad beacon body")
            return True
        body = self.rfile.read(length)
        name = path[len("/__kenos_beacon") :].strip("/") or "beacon"
        name = "".join(c if c.isalnum() or c in "-_" else "_" for c in name)[:80]
        try:
            BEACON_DIR.mkdir(parents=True, exist_ok=True)
            # Tag with app + port so Continuity domains do not clobber each other.
            out = BEACON_DIR / f"{APP}-{PORT}-{name}.json"
            out.write_bytes(body)
            sys.stderr.write("kenos_beacon %s bytes=%s\n" % (out.name, len(body)))
        except Exception as err:
            msg = f"beacon_write_error: {err}".encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(msg)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(msg)
            return True
        reply = b'{"ok":true}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(reply)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(reply)
        return True

    def _reject_disabled_localai(self) -> bool:
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path == LOCALAI_PREFIX or path.startswith(LOCALAI_PREFIX + "/"):
            self._send_plain(404, "localai_proxy_disabled")
            return True
        return False

    def do_POST(self) -> None:  # noqa: N802
        if self._try_localai_proxy():
            return
        if self._reject_disabled_localai():
            return
        if self._handle_kenos_beacon():
            return
        self.send_error(405, "Method Not Allowed")

    def do_PUT(self) -> None:  # noqa: N802
        if self._try_localai_proxy():
            return
        if self._reject_disabled_localai():
            return
        self.send_error(405, "Method Not Allowed")

    def do_DELETE(self) -> None:  # noqa: N802
        if self._try_localai_proxy():
            return
        if self._reject_disabled_localai():
            return
        self.send_error(405, "Method Not Allowed")

    def do_OPTIONS(self) -> None:  # noqa: N802
        if self._try_localai_proxy():
            return
        if self._reject_disabled_localai():
            return
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path == "/__kenos_beacon" or path.startswith("/__kenos_beacon/"):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "content-type")
            self.send_header("Access-Control-Allow-Methods", "POST,OPTIONS")
            self.send_header("Connection", "close")
            self.end_headers()
            return
        self.send_error(405, "Method Not Allowed")

    def do_PATCH(self) -> None:  # noqa: N802
        if self._try_localai_proxy():
            return
        if self._reject_disabled_localai():
            return
        self.send_error(405, "Method Not Allowed")

    def do_HEAD(self) -> None:  # noqa: N802
        if self._try_localai_proxy():
            return
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path == LOCALAI_PREFIX or path.startswith(LOCALAI_PREFIX + "/"):
            self._send_plain(404, "localai_proxy_disabled")
            return
        return super().do_HEAD()


class Server(ThreadingHTTPServer):
    allow_reuse_address = True
    # Default backlog is 5 — WKWebView loads 20+ chunks at once and gets RST →
    # SvelteKit dynamic import fails → client shows "500 Internal Error".
    request_queue_size = 256
    daemon_threads = True


def main() -> None:
    httpd = Server((BIND, PORT), Handler)
    trust_ips = sorted(_load_trust_ips())
    print(
        f"[kenos-static:{APP}] {ROOT} → http://{BIND}:{PORT} "
        f"(backlog={httpd.request_queue_size}, localai_proxy={LOCALAI_PROXY}, "
        f"allow_lan={ALLOW_LAN}, max_inflight={MAX_INFLIGHT}, "
        f"trust_ips={trust_ips or ['(none)']})",
        flush=True,
    )
    httpd.serve_forever()


if __name__ == "__main__":
    main()
