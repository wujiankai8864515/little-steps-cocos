#!/usr/bin/env python3
"""Shared entry point: python3 -B builds/build.py [channel] [options]."""
import re
import subprocess
import sys
from pathlib import Path

def main():
    directory = Path(__file__).resolve().parent
    args = sys.argv[1:]
    channel = args.pop(0) if args and not args[0].startswith('-') else 'wechatgame'
    if not re.fullmatch(r'[a-z0-9_-]+', channel):
        raise SystemExit('Invalid channel')
    builder = directory / channel / 'build.py'
    if not builder.is_file():
        raise SystemExit('No builder for channel: ' + channel)
    raise SystemExit(subprocess.run([sys.executable, str(builder), *args], cwd=directory.parent).returncode)

if __name__ == '__main__':
    main()
