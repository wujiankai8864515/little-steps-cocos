#!/usr/bin/env python3
"""Shared entry point: python3 -B builds/build.py [channel] [options]."""
import re
import json
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
    if channel == 'wechatgame' and '--game' in args:
        index = args.index('--game')
        if index + 1 >= len(args):
            raise SystemExit('--game requires a game name')
        game = args[index + 1]
        if game == 'xiaoyu-cocos':
            del args[index:index + 2]
        elif re.fullmatch(r'[a-z0-9_-]+', game) and (directory / 'wechatgame/games' / (game + '.json')).is_file():
            mapping = json.loads((directory / 'wechatgame/games' / (game + '.json')).read_text())
            entry = mapping.get('builder', 'build_game.py')
            if not re.fullmatch(r'[a-z0-9_-]+\.py', entry):
                raise SystemExit('Invalid WeChat builder mapping for game: ' + game)
            builder = directory / 'wechatgame' / entry
        else:
            raise SystemExit('No WeChat packaging configuration for game: ' + game)
    if not builder.is_file():
        raise SystemExit('No builder for channel: ' + channel)
    raise SystemExit(subprocess.run([sys.executable, str(builder), *args], cwd=directory.parent).returncode)

if __name__ == '__main__':
    main()
