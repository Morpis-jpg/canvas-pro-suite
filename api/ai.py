import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler


def send(handler, status, body, content_type="application/json"):
    if isinstance(body, str):
        body = body.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "X-AI-Provider, X-AI-Url, X-AI-Key, X-AI-Session, Content-Type, Accept")
    handler.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
    handler.send_header("Access-Control-Max-Age", "86400")
    handler.end_headers()
    handler.wfile.write(body)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        return

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "X-AI-Provider, X-AI-Url, X-AI-Key, X-AI-Session, Content-Type, Accept")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def do_POST(self):
        provider = (self.headers.get("X-AI-Provider") or "openai").lower()
        if provider == "opencode":
            send(self, 502, '{"message":"The opencode provider only works with the local server (server.py)."}')
            return
        url = (self.headers.get("X-AI-Url") or "").strip()
        if not url.startswith("https://"):
            send(self, 400, '{"message":"Missing or invalid X-AI-Url header"}')
            return
        length = int(self.headers.get("Content-Length", "0") or 0)
        body = self.rfile.read(length) if length else b""
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        key = (self.headers.get("X-AI-Key") or "").strip()
        if key:
            headers["Authorization"] = "Bearer " + key
        request = urllib.request.Request(url, data=body, method="POST", headers=headers)
        try:
            response = urllib.request.urlopen(request, timeout=120)
            data = response.read()
            status = response.status
            content_type = response.headers.get_content_type() or "application/json"
        except urllib.error.HTTPError as error:
            data = error.read()[:4000]
            status = error.code
            content_type = (error.headers.get_content_type() if error.headers else "application/json")
        except Exception as error:
            send(self, 502, '{"message":"AI upstream error: ' + str(error)[:200].replace('"', "'") + '"}')
            return
        send(self, status, data, content_type)
