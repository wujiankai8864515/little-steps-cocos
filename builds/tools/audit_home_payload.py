#!/usr/bin/env python3
"""Check the original deferred Home closure against actual Creator output.

The Godot gate counts non-startup house/exterior packs, not engine/login/comic
traffic. Cocos currently acquires every asset in each selected group, so count
whole output bundles (including metadata), following both product and Creator
dependencies. This does not measure wire transfer, latency or device memory.
"""
import json
import re
from pathlib import Path

HOME_LIMIT = 19_000_000
STARTUP = frozenset(('core_code', 'shared_boot_ui'))
OPTIONAL = frozenset(('travel_visual', 'departure_visual', 'darkroom', 'photo_visual',
                      'wardrobe_visual', 'outfit_visual'))


def audit_home_payload(project, output, remote_bundles):
    groups = json.loads((Path(project) / 'assets/resources/source-catalog.json').read_text())['groups']
    output = Path(output)
    remote = set(remote_bundles)
    visiting, visited, bundles, excluded, errors = set(), set(), [], [], []

    def visit(name):
        if not isinstance(name, str) or not re.fullmatch(r'[a-zA-Z0-9_-]+', name):
            raise ValueError('Invalid Home dependency name')
        if name in visiting:
            raise ValueError('Cyclic Home dependency: ' + name)
        if name in visited:
            return
        if name not in groups:
            raise ValueError('Unknown Home dependency: ' + name)
        visiting.add(name)
        for dependency in groups[name].get('depends_on', []):
            visit(dependency)
        root = output / ('remote' if name in remote else 'assets') / name
        configs = list(root.glob('config*.json'))
        if len(configs) != 1:
            raise ValueError('Expected one output bundle config: ' + name)
        config = json.loads(configs[0].read_text())
        if config.get('name') != name:
            raise ValueError('Output bundle identity mismatch: ' + name)
        for dependency in config.get('deps', []):
            visit(dependency)
        paths = sorted(p for p in root.rglob('*') if p.is_file())
        if not paths or any(not p.resolve().is_relative_to(output.resolve()) for p in paths):
            raise ValueError('Missing or escaping output bundle: ' + name)
        row = {'name': name, 'directory': root.relative_to(output).as_posix(),
               'fileCount': len(paths), 'rawBytes': sum(p.stat().st_size for p in paths)}
        (excluded if name in STARTUP else bundles).append(row)
        visiting.remove(name)
        visited.add(name)

    try:
        visit('home')
    except (KeyError, TypeError, ValueError, OSError) as error:
        errors.append(str(error))
    forbidden = sorted(visited & OPTIONAL)
    total = sum(row['rawBytes'] for row in bundles)
    passed = not errors and not forbidden and total <= HOME_LIMIT
    return {'status': 'passed_static_closure_only' if passed else 'failed',
            'passed': passed, 'limitBytes': HOME_LIMIT, 'rawDeferredBytes': total,
            'excessBytes': max(0, total - HOME_LIMIT), 'bundles': bundles,
            'excludedStartupBundles': excluded, 'forbiddenDependencies': forbidden,
            'errors': errors, 'method': 'Exact output bytes of the transitive Home bundle closure; only core_code/shared_boot_ui excluded as startup. Not network transfer, startup time or memory.',
            'sourceContract': 'little-steps/build/check_loading_contract.py: Home non-startup dependency packs <= 19,000,000 bytes; no travel/departure dependency.'}
