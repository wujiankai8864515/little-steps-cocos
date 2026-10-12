#!/usr/bin/env python3
"""Serve the fixed WeChat CDN directory on loopback, including audio ranges."""
import argparse
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import functools
import json
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit
from common import PreviewHandler

ROOT = Path(__file__).resolve().parents[2]
DIRECTORY = ROOT / 'builds/wechatgame'
HEALTH_PATH = '/__little_steps_wechat__'


class WechatHandler(PreviewHandler):
    def is_remote_path(self):
        return (urlsplit(self.path).path.startswith('/remote/') and
                Path(self.translate_path(self.path)).resolve().is_relative_to((DIRECTORY / 'remote').resolve()))

    def do_HEAD(self):
        if self.is_remote_path():
            super().do_HEAD()
        else:
            self.send_error(404)

    def do_GET(self):
        if urlsplit(self.path).path == HEALTH_PATH:
            body = json.dumps({'directory': str(DIRECTORY), 'platform': 'wechatgame'}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.is_remote_path():
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
