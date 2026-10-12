#!/usr/bin/env python3
"""Migration preview CLI using the shared packaging HTTP byte-range handler."""
import argparse
import functools
import os
import sys
from pathlib import Path
from http.server import ThreadingHTTPServer
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'builds'))
from common import PreviewHandler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', required=True)
    parser.add_argument('--port', type=int, required=True)
    args = parser.parse_args()
    handler = functools.partial(PreviewHandler, directory=os.path.abspath(args.directory))
    with ThreadingHTTPServer(('127.0.0.1', args.port), handler) as server:
        server.serve_forever()


if __name__ == '__main__':
    main()
