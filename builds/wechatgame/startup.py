"""Apply a guarded, minimal hook to Creator's generated entry; never hardcode MD5 paths."""
import re


def finalize(output):
    path = output / 'game.js'
    source = path.read_text()
    declaration = re.search(r"const firstScreen = require\('\./first-screen(?:\.[0-9a-f]+)?(?:\.js)?'\);", source)
    if not declaration or source.count('firstScreen.start(') != 1:
        raise ValueError('Creator startup template changed; review early loading hook before publishing')
    marker = declaration.group(0)
    # Render after the adapter establishes the main canvas, ahead of polyfills,
    # SystemJS and the engine. Reuse the exact generated WebGL options.
    call = re.search(r"firstScreen\.start\(([^)]*)\)", source)
    source = source.replace(marker, marker + '\nfirstScreen.start(' + call.group(1) + ');', 1)
    path.write_text(source)
