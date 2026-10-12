"""Restore a pinned historical reference for explicitly invoked migration tools.

Normal Cocos builds and regression tests never use this archived Godot tree.
"""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def legacy_reference():
    metadata = json.loads((ROOT / 'migration/archives/godot-history.json').read_text())
    target = ROOT / 'migration/.cache/godot-reference'
    if not target.exists():
        bundle = ROOT / metadata['archive']
        if not bundle.is_file():
            raise FileNotFoundError('Historical reference archive is absent. Restore the pinned private little-steps source described in migration/archives/README.md; daily Cocos builds do not need it.')
        if hashlib.sha256(bundle.read_bytes()).hexdigest() != metadata['archiveSHA256']:
            raise ValueError('Historical Git bundle hash mismatch')
        target.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(['git', 'clone', '--quiet', '--branch', 'main', str(bundle), str(target)], check=True)
    commit = subprocess.check_output(['git', '-C', str(target), 'rev-parse', 'HEAD'], text=True).strip()
    tree = subprocess.check_output(['git', '-C', str(target), 'rev-parse', 'HEAD^{tree}'], text=True).strip()
    if commit != metadata['sourceCommit'] or tree != metadata['sourceTree']:
        raise ValueError('Historical reference is not the pinned archived source')
    if subprocess.check_output(['git', '-C', str(target), 'status', '--porcelain'], text=True):
        raise ValueError('Historical reference has local changes; do not import them as approved source')
    return target


if __name__ == '__main__':
    print(legacy_reference())
