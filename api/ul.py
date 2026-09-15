import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler

MAX_BYTES = 25 * 1024 * 1024


def send(handler, status, body, content_type="application/json"):
    if isinstance(body, str):
        body = body.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")
    handler.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
    handler.end_headers()
    handler.wfile.write(body)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        return

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.end_headers()

    def do_POST(self):
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        target = query.get("u", [""])[0]
        content_type = (self.headers.get("Content-Type") or "").strip()
        parsed = urllib.parse.urlsplit(target)
        if not target or parsed.scheme != "https" or not content_type:
            send(self, 400, '{"message":"Missing or invalid upload target"}')
            return
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length > MAX_BYTES:
            send(self, 413, '{"message":"Upload too large for this mirror (25 MB max)."}')
            return
        body = self.rfile.read(length) if length else b""
        request = urllib.request.Request(target, data=body, method="POST", headers={"Content-Type": content_type})
        try:
            response = urllib.request.urlopen(request, timeout=600)
            data = response.read()
            status = response.status
            ctype = response.headers.get_content_type() or "application/json"
        except urllib.error.HTTPError as error:
            data = error.read()
            status = error.code
            ctype = (error.headers.get_content_type() if error.headers else "application/json")
        except Exception as error:
            send(self, 502, '{"message":"Upload relay failed: ' + str(error)[:200].replace('"', "'") + '"}')
            return
        send(self, status, data, ctype)
