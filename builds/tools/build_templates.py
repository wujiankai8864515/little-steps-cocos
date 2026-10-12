"""Connect Creator's native template input to the packaging repository."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def install(root=ROOT):
    root = Path(root)
    templates = root / 'builds/templates'
    if not (templates / 'wechatgame').is_dir():
        raise ValueError('Missing builds/templates/wechatgame')
    link = root / 'games/xiaoyu-cocos/build-templates'
    relative = Path(os.path.relpath(templates, link.parent))
    if link.is_symlink():
        if link.readlink() != relative:
            raise ValueError('Unexpected build-templates link; refusing to replace it')
    elif link.exists():
        raise ValueError('build-templates is a real directory; migrate its contents first')
    else:
        link.symlink_to(relative, target_is_directory=True)
    if link.resolve() != templates.resolve():
        raise ValueError('Invalid build-templates target')
    return link


if __name__ == '__main__':
    print(install())
