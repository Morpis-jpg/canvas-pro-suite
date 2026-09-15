import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        return

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "X-Canvas-Token, X-Canvas-Base, Content-Type, Accept")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        target = query.get("u", [""])[0]
        token = self.headers.get("X-Canvas-Token", "")
        parsed = urllib.parse.urlsplit(target)
        if not target or not token or parsed.scheme not in ("http", "https"):
            self.send_error(400, "Missing or invalid download target")
            return
        try:
            response = urllib.request.urlopen(
                urllib.request.Request(target, headers={"Authorization": "Bearer " + token, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}),
                timeout=90,
            )
            body = response.read()
            self.send_response(response.status)
            self.send_header("Content-Type", response.headers.get_content_type() or "application/octet-stream")
            self.send_header("Content-Disposition", "inline")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except urllib.error.HTTPError as error:
            body = error.read()
            self.send_response(error.code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as error:
            self.send_error(502, "Download proxy failed: " + str(error))
