#!/usr/bin/env python3
"""Serve the fixed WeChat CDN directory on loopback, including audio ranges."""
import argparse
import functools
import json
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from serve_preview import PreviewHandler

ROOT = Path(__file__).resolve().parents[2]
DIRECTORY = ROOT / 'builds/cdn/wechatgame'
HEALTH_PATH = '/__little_steps_wechat__'


class WechatHandler(PreviewHandler):
    def do_GET(self):
        if urlsplit(self.path).path == HEALTH_PATH:
            body = json.dumps({'directory': str(DIRECTORY), 'platform': 'wechatgame'}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif urlsplit(self.path).path.startswith('/remote/'):
            super().do_GET()
        else:
            self.send_error(404)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8794)
    args = parser.parse_args()
    if not (DIRECTORY / 'remote').is_dir():
        parser.error('Build the WeChat workspace first')
    handler = functools.partial(WechatHandler, directory=str(DIRECTORY))
    with ThreadingHTTPServer(('127.0.0.1', args.port), handler) as server:
        print(json.dumps({'url': f'http://127.0.0.1:{args.port}/', 'directory': str(DIRECTORY)}), flush=True)
        server.serve_forever()
