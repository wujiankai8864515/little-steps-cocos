#!/usr/bin/env python3
"""Loopback-only, non-caching host for a named immutable Creator QA candidate."""
import argparse,json,functools
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
ROOT=Path(__file__).resolve().parents[2]
class CandidateHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        super().end_headers()
def main():
    p=argparse.ArgumentParser();p.add_argument('--name',required=True);p.add_argument('--port',type=int,required=True);a=p.parse_args()
    if not a.name or not all(c.isalnum() or c in '-_' for c in a.name):p.error('Invalid candidate name')
    stage=ROOT/'builds/work'/a.name;config=json.loads((stage/'build-config.json').read_text());directory=(Path(config['buildPath'])/config['outputName']).resolve()
    assert directory.is_relative_to(stage.resolve()) and (directory/'index.html').is_file(),'Missing isolated candidate output'
    host=ThreadingHTTPServer(('127.0.0.1',a.port),functools.partial(CandidateHandler,directory=str(directory)))
    print(json.dumps({'candidate':a.name,'url':f'http://127.0.0.1:{a.port}/','directory':str(directory),'cache':'no-store'}),flush=True)
    try:host.serve_forever()
    except KeyboardInterrupt:pass
    finally:host.server_close()
if __name__=='__main__':main()
