# Reproducible production font subsets

The full font inputs are vendored for offline builds. They are the exact upstream
Regular faces matching the recovered game fonts: LXGW WenKai 1.522 and Noto Sans
CJK JP 2.004. `manifest.json` pins their official download URLs, SHA256 values,
licenses, and the original four recovered subsets. `requirements.txt` pins
fontTools 4.61.1. Install that dependency from the official PyPI package registry
if it is not already available.

From the repository root:

```sh
python3 build/prepare_fonts.py
python3 build/prepare_fonts.py --check
python3 build/prepare_fonts.py --output-project /path/to/assembled/project --report /path/to/qa/font_coverage.json
python3 build/fonts/test_prepare_fonts.py
```

The Python API is `prepare_fonts(output_project=None, report_path=None,
check=False) -> dict` in `build/prepare_fonts.py`. It raises
`FontPreparationError` with `.report` on a validation failure. The default CLI
report is `build/fonts/coverage.json`; the API writes a report only when given a
path. `--check` rebuilds in memory and compares the exact bytes. Successful
identical reruns leave font asset timestamps unchanged. No network access is
used by preparation.

## GlyphPolicy

The named `GlyphPolicy` class is the build contract and is copied into every
coverage report. All four outputs contain the same required Unicode union:

- Every codepoint in every current `.gd`, `.tscn`, `.tres`, and `.json` file under
  `games/travel_woodfish/project` and `framework`, including source syntax and
  comments. JSON strings and explicit Godot Unicode escapes are also decoded.
- All original cmap entries in **all four** pinned recovered subsets. This
  preserves text assembled dynamically that is no longer a contiguous literal.
- Printable ASCII U+0020 through U+007E for dynamic numbers and basic text.
- TAB, LF, and CR are layout controls and need no drawable glyph. There are no
  other implicit exclusions or Unicode normalization.

Every required character must exist in both pinned full source fonts. Missing
glyphs fail before any generated asset is replaced, with codepoint, Unicode
name, font, and source locations. Adding a new character requires a reviewed
source-text change or an explicit font-policy change; there is no full-font
fallback, merging, replacement font, runtime download, or system-font fallback
in this workflow. New runtime non-ASCII input not represented by the corpus
must be rejected by the application or become part of a new verified build.

The production importer must explicitly set FontFile `allow_system_fallback` to
false and `fallbacks` to an empty array. The font compiler cannot enforce an
application's runtime import flags. It reports this integration requirement.

## Style, formats, and verification

Both upstream input hashes and both license hashes are checked before every
build. The compiler validates original baseline outlines, units-per-em, line
metrics, and horizontal/vertical metrics against the matching upstream font. It then compares
every required output glyph against that upstream source and compares original
glyphs against their recovered baselines. The baseline family names are
preserved, including Travel Woodfish Bootstrap and Travel Woodfish Comic.
Upstream copyright/license/trademark name records are retained.

`assets/font.ttf` deliberately keeps its historical filename, but its bytes are
OpenType/CFF, just like the recovered original. Converting it to TrueType would
unnecessarily change Noto's outlines. The other three files remain TrueType.
Layout feature closure, original hinting, and `.notdef` outlines are preserved.

Font timestamps are not recalculated, and no wall-clock time, absolute output
path, or network state enters font bytes or the coverage report. The report
includes source-file hashes, the required codepoint list/hash, output hashes,
and exact coverage/style checks. `--check` verifies the current corpus rather
than trusting a stale report. Re-run after the final UI copy is settled.
If the source corpus changes while generation is running, preparation fails
before replacing font assets. The regression check exercises two identical
generations, missing-glyph rejection without modifying existing outputs, and
read-only rejection of a corrupted generated font.

## Provenance and licenses

- LXGW: https://github.com/lxgw/LxgwWenKai/releases/tag/v1.522
- Noto: https://github.com/notofonts/noto-cjk/releases/tag/Sans2.004
- License copies are in `licenses/`; preserve them in source distributions and
  ship the corresponding notices with web/native distributions.

The four small files in `baseline/` are exact decoded imported-font resources
from the recovered `fa1e74ca277bdbb66c61b7caefdb7d45e367599c` game export. Full
font authoring sources and the old subset command were not recovered. The full
upstream fonts and this compiler were added for the current production rebuild.
