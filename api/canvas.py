import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler


def write_response(handler, status, body, content_type="application/json", link=None):
    if isinstance(body, str):
        body = body.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    if link:
        handler.send_header("Link", link)
    handler.end_headers()
    handler.wfile.write(body)


def rewrite_link(value, host):
    links = []
    for raw in value.split(","):
        raw = raw.strip()
        target = raw.split(";", 1)[0].strip("<>")
        parts = urllib.parse.urlsplit(target)
        if not parts.path:
            continue
        path = parts.path + (("?" + parts.query) if parts.query else "")
        rel = ";" + raw.split(";", 1)[1] if ";" in raw else ""
        links.append("<https://" + host + "/api/canvas?p=" + urllib.parse.quote(path, safe="") + ">" + rel)
    return ", ".join(links)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        return

    def proxy(self, method):
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        canvas_path = query.get("p", [""])[0]
        token = self.headers.get("X-Canvas-Token", "")
        base = self.headers.get("X-Canvas-Base", "").rstrip("/")
        parsed_base = urllib.parse.urlsplit(base)
        if not canvas_path or not token or not base:
            write_response(self, 400, '{"message":"Missing Canvas proxy parameters."}')
            return
        if parsed_base.scheme not in ("http", "https") or not canvas_path.startswith("/api/"):
            write_response(self, 400, '{"message":"Invalid Canvas proxy target."}')
            return

        length = int(self.headers.get("Content-Length", "0") or 0)
        body = self.rfile.read(length) if length else None
        request = urllib.request.Request(
            base + canvas_path,
            data=body,
            method=method,
            headers={
                "Authorization": "Bearer " + token,
                "Content-Type": self.headers.get("Content-Type", "application/json"),
                "Accept": "application/json",
            },
        )
        try:
            response = urllib.request.urlopen(request, timeout=55)
            payload = response.read()
            status = response.status
            content_type = response.headers.get_content_type() or "application/json"
            link = response.headers.get("Link")
        except urllib.error.HTTPError as error:
            payload = error.read()
            status = error.code
            content_type = error.headers.get_content_type() or "application/json"
            link = error.headers.get("Link")
        except Exception as error:
            write_response(self, 502, '{"message":"Canvas proxy failed: ' + str(error).replace('"', "'") + '"}')
            return

        write_response(self, status, payload, content_type, rewrite_link(link, self.headers.get("Host", "localhost")) if link else None)

    def do_GET(self):
        self.proxy("GET")

    def do_POST(self):
        self.proxy("POST")

    def do_PUT(self):
        self.proxy("PUT")

    def do_PATCH(self):
        self.proxy("PATCH")

    def do_DELETE(self):
        self.proxy("DELETE")
