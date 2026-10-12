"""Compatibility for historical migration commands; production lives in builds/wechatgame."""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'builds'))
sys.path.insert(0, str(ROOT / 'builds/wechatgame'))
from prepare import *

if __name__ == '__main__':
    main()
