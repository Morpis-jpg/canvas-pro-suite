import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        return

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
                urllib.request.Request(target, headers={"Authorization": "Bearer " + token}),
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
