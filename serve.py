#!/usr/bin/env python3
"""Static dev/deploy server for Wipfel.

- Serves this folder over HTTP (default 127.0.0.1:8200).
- Sends `Cache-Control: no-store` so browsers never serve stale ES modules from disk cache.
- Registers MIME types that Python's default map gets wrong or misses (.js/.mjs/.wasm/.json).
- No external dependencies; Python 3.8+.

Usage:
    python serve.py                # http://127.0.0.1:8200/
    python serve.py --port 8300    # different port
    python serve.py --bind 0.0.0.0 # expose on the LAN (deploy on a small box)
"""
import argparse
import http.server
import mimetypes
import os
import socketserver
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))

MIME_OVERRIDES = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".wasm": "application/wasm",
    ".json": "application/json",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json",
}


class NoStoreHandler(http.server.SimpleHTTPRequestHandler):
    """SimpleHTTPRequestHandler with no-store caching and explicit MIME types."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def guess_type(self, path):
        _, ext = os.path.splitext(path)
        override = MIME_OVERRIDES.get(ext.lower())
        if override:
            return override
        return super().guess_type(path)

    def log_message(self, fmt, *args):
        # Quieter log: method, path, status only.
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


class ReusableTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    parser = argparse.ArgumentParser(description="Serve the Wipfel folder over HTTP.")
    parser.add_argument("--port", type=int, default=8200)
    parser.add_argument("--bind", default="127.0.0.1")
    args = parser.parse_args()

    for ext, mime in MIME_OVERRIDES.items():
        mimetypes.add_type(mime, ext)

    with ReusableTCPServer((args.bind, args.port), NoStoreHandler) as httpd:
        print("Wipfel dev server: http://%s:%d/  (Ctrl+C to stop)" % (args.bind, args.port))
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
