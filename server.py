import os, sys, socketserver, threading, webbrowser, json, traceback
import urllib.request, urllib.parse

import http.server

PORT_START = 8000
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(PROJECT_DIR)

def rewrite_pagelink(value, host):
    """Rewrite Canvas pagination Link header to point back at this proxy."""
    parts = []
    for link in value.split(","):
        link = link.strip()
        m = urllib.parse.urlsplit(link)
        if not m.path:
            continue
        # everything after the host (path?query) becomes the proxied path
        path = m.path
        if m.query:
            path += "?" + m.query
        proxied = "http://" + host + "/api/canvas?p=" + urllib.parse.quote(path, safe="")
        parts.append(f"<{proxied}>; {link.split('>')[1].strip()}" if ";" in link else f"<{proxied}>")
    return ", ".join(parts)

class Handler(http.server.SimpleHTTPRequestHandler):
    server_version = "CanvasPro/0.2"

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=PROJECT_DIR, **kw)

    def end_headers(self):
        # Dev server: never cache, so updated JS always loads without hard refreshes.
        try:
            self.send_header("Cache-Control", "no-store")
        except Exception:
            pass
        super().end_headers()

    def log_message(self, fmt, *args):
        msg = fmt % args
        if "/api/canvas" not in msg:
            sys.stderr.write("  %s\n" % msg)

    # ---- Canvas API proxy (local only; token never leaves this machine) ----
    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        return self.rfile.read(length) if length else None

    def do_CANVAS(self, method="GET", body=None):
        parsed = urllib.parse.urlsplit(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        canvas_path = qs.get("p", [""])[0]
        token = self.headers.get("X-Canvas-Token", "")
        base = self.headers.get("X-Canvas-Base", "").rstrip("/")

        if not canvas_path or not token or not base:
            self.send_error(400, "Missing p / X-Canvas-Token / X-Canvas-Base")
            return

        target = base + canvas_path
        headers = {"Authorization": "Bearer " + token}
        ct = self.headers.get("Content-Type")
        if ct:
            headers["Content-Type"] = ct
        req = urllib.request.Request(target, data=body, method=method, headers=headers)
        try:
            resp = urllib.request.urlopen(req, timeout=60)
        except urllib.error.HTTPError as e:
            body_resp = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body_resp)))
            self.end_headers()
            self.wfile.write(body_resp)
            return
        except Exception as e:
            self.send_error(502, "Proxy to Canvas failed: %s" % e)
            return

        body_out = resp.read()
        self.send_response(resp.status)
        self.send_header("Content-Type", resp.headers.get_content_type() or "application/json")
        rel = resp.headers.get("Link")
        if rel:
            host = self.headers.get("Host", "localhost:" + str(PORT_START))
            self.send_header("Link", rewrite_pagelink(rel, host))
        self.send_header("Content-Length", str(len(body_out)))
        self.end_headers()
        self.wfile.write(body_out)

    # ---- file download passthrough (token-authenticated, streams bytes) ----
    def do_DL(self):
        parsed = urllib.parse.urlsplit(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        u = qs.get("u", [""])[0]
        token = self.headers.get("X-Canvas-Token", "")
        if not u or not token:
            self.send_error(400, "Missing u / X-Canvas-Token")
            return
        req = urllib.request.Request(u, headers={"Authorization": "Bearer " + token})
        try:
            resp = urllib.request.urlopen(req, timeout=120)
        except urllib.error.HTTPError as e:
            body = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        except Exception as e:
            self.send_error(502, "File proxy failed: %s" % e)
            return
        data = resp.read()
        self.send_response(resp.status)
        self.send_header("Content-Type", resp.headers.get_content_type() or "application/octet-stream")
        self.send_header("Content-Disposition", "inline")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith("/api/canvas") or self.path.startswith("/api/canvas?"):
            return self.do_CANVAS()
        if self.path.startswith("/api/dl?") or self.path.startswith("/api/dl"):
            return self.do_DL()
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/ai"):
            return self.do_AI()
        if self.path.startswith("/api/canvas"):
            return self.do_CANVAS(method="POST", body=self._read_body())
        return super().do_POST()

    def do_PUT(self):
        if self.path.startswith("/api/canvas"):
            return self.do_CANVAS(method="PUT", body=self._read_body())
        return super().do_PUT()

    def do_DELETE(self):
        if self.path.startswith("/api/canvas"):
            return self.do_CANVAS(method="DELETE", body=self._read_body())
        return super().do_DELETE()

    def do_AI(self):
        try:
            self._do_ai_impl()
        except Exception as e:
            print("AI route error:", traceback.format_exc())
            self.send_error(500, "AI proxy internal error")
        finally:
            try:
                self.wfile.flush()
            except Exception:
                pass

    def _send_json(self, code, data, ctype="application/json"):
        self.send_response(code)
        self.send_header("Content-Type", ctype or "application/json; charset=utf-8")
        sess = getattr(self, "_ai_session", None)
        if sess:
            self.send_header("X-AI-Session", str(sess))
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _do_ai_impl(self):
        provider = (self.headers.get("X-AI-Provider") or "openai").lower()
        if provider == "opencode":
            return self._do_opencode()
        body = self._read_body()
        url = self.headers.get("X-AI-Url", "").strip()
        if not url:
            return self.send_error(400, "Missing X-AI-Url header")
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        key = self.headers.get("X-AI-Key", "").strip()
        if key:
            headers["Authorization"] = "Bearer " + key
        req = urllib.request.Request(url, data=body, method="POST", headers=headers)
        try:
            resp = urllib.request.urlopen(req, timeout=240)
        except urllib.error.HTTPError as e:
            err = e.read()[:2000]
            return self._send_json(e.code, err, (e.headers.get("Content-Type") or "application/json").split(";")[0])
        except Exception as e:
            return self.send_error(502, "AI upstream error: " + str(e)[:200])
        data = resp.read()
        self._send_json(resp.getcode() or 200, data, (resp.headers.get("Content-Type") or "application/json").split(";")[0])

    def _do_opencode(self):
        body = self._read_body()
        base = (self.headers.get("X-AI-Url") or "http://localhost:4096").strip().rstrip("/")
        sid = (self.headers.get("X-AI-Session") or "").strip()
        payload = {}
        try:
            payload = json.loads(body)
        except Exception:
            pass
        msgs = payload.get("messages") or []
        last_user = ""
        for m in reversed(msgs):
            c = m.get("content")
            if m.get("role") == "user" and isinstance(c, str) and c.strip():
                last_user = c
                break
        model = payload.get("model")

        resp = None
        for attempt in (1, 2):
            try:
                if not sid:
                    sid = self._oc_create(base)
                msgbody = {"parts": [{"type": "text", "text": last_user or "(empty prompt)"}]}
                if model:
                    msgbody["model"] = model
                resp = self._oc_post(base, sid, msgbody)
                break
            except urllib.error.HTTPError as e:
                if e.code == 404 and attempt == 1:
                    self._oc_delete(base, sid)
                    sid = ""
                    continue
                err = e.read()[:2000]
                return self._send_json(e.code, err or json.dumps({"error": {"message": "opencode HTTP " + str(e.code)}}).encode())
            except Exception as e:
                return self.send_error(502, "Cannot reach opencode serve at %s (%s). Start it with `opencode serve`." % (base, str(e)[:120]))
        self._ai_session = sid
        parts = (resp or {}).get("parts") or []
        texts = [p.get("text", "") for p in parts if p.get("type") == "text" and (p.get("text") or "").strip()]
        reply = "\n".join(texts).strip() or "(no text reply from opencode)"
        self._send_json(200, json.dumps({"choices": [{"message": {"role": "assistant", "content": reply}}]}).encode(), "application/json")

    def _oc_create(self, base):
        req = urllib.request.Request(base + "/session", data=b'{"title":"Canvas Pro"}',
                                     headers={"Content-Type": "application/json", "Accept": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=30) as r:
            sess = json.loads(r.read())
        return (sess or {}).get("id")

    def _oc_delete(self, base, sid):
        try:
            urllib.request.urlopen(urllib.request.Request(base + "/session/" + sid, method="DELETE"), timeout=15)
        except Exception:
            pass

    def _oc_post(self, base, sid, msgbody):
        req = urllib.request.Request(base + "/session/" + sid + "/message", data=json.dumps(msgbody).encode(),
                                     headers={"Content-Type": "application/json", "Accept": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=900) as r:
            return json.loads(r.read())

def pick_port():
    for port in range(PORT_START, PORT_START + 20):
        try:
            with socketserver.TCPServer(("0.0.0.0", port), Handler) as probe:
                pass
        except OSError:
            continue
        return port
    return None

def main():
    env_port = os.environ.get("PORT")
    if env_port:
        port = int(env_port)
    else:
        port = pick_port()
    if port is None:
        print("No free port found in 8000-8019. Close something and retry.")
        sys.exit(1)

    class ThreadingServer(socketserver.ThreadingTCPServer):
        allow_reuse_address = True
        daemon_threads = True

    httpd = ThreadingServer(("0.0.0.0", port), Handler)
    url = f"http://localhost:{port}"
    print(f"\nCanvas Pro is running at  {url}", flush=True)
    print("Keep this window open. Press Ctrl+C to stop.\n", flush=True)

    if not env_port:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")

if __name__ == "__main__":
    main()