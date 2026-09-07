#!/usr/bin/env python3
"""Sirve site/ en local y proxea /api al API Gateway de producción."""

from __future__ import annotations

import argparse
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
DEFAULT_API = "https://ohqbk8ppmi.execute-api.us-east-1.amazonaws.com/v1"


class SiteHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, api_url: str, **kwargs):
        self.api_url = api_url.rstrip("/")
        super().__init__(*args, **kwargs)

    def end_headers(self):
        if self.path.startswith("/js/") or self.path.startswith("/css/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path.startswith("/api/") or self.path == "/api":
            self.proxy_api()
            return
        super().do_GET()

    def proxy_api(self):
        suffix = self.path[4:] or "/"
        if suffix.startswith("/"):
            target = f"{self.api_url}{suffix}"
        else:
            target = f"{self.api_url}/{suffix}"
        request = Request(target, headers={"Accept": "application/json"})
        try:
            with urlopen(request, timeout=20) as response:
                body = response.read()
                self.send_response(response.status)
                self.send_header("Content-Type", response.headers.get("Content-Type", "application/json"))
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
        except HTTPError as exc:
            body = exc.read()
            self.send_response(exc.code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except URLError as exc:
            payload = f'{{"ok":false,"error":"proxy","detail":"{exc.reason}"}}'.encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    def log_message(self, format, *args):
        super().log_message(format, *args)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "4173")))
    parser.add_argument("--api", default=os.environ.get("CAVEDREPA_API_URL", DEFAULT_API))
    args = parser.parse_args()

    handler = partial(SiteHandler, directory=str(SITE), api_url=args.api)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Local:  http://127.0.0.1:{args.port}/directorio/")
    print(f"API →   {args.api}")
    server.serve_forever()


if __name__ == "__main__":
    main()
