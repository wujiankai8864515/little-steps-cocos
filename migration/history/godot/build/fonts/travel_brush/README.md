# Encounter-only brush lettering

Ma Shan Zheng Regular 2.003, SIL Open Font License 1.1. Complete license is
`../licenses/MaShanZheng-OFL.txt`, copied into Web delivery by the existing builder.
Official project: https://github.com/googlefonts/mashanzheng
Official source: https://raw.githubusercontent.com/google/fonts/main/ofl/mashanzheng/MaShanZheng-Regular.ttf
The vendored authoring source is hash-pinned in `prepare_travel_brush.py`.

Run after editing travel text, before refreshing resource contracts:

    python3 build/fonts/travel_brush/prepare_travel_brush.py games/travel_woodfish/project --output games/travel_woodfish/project/travel/assets/travel_brush.ttf

This independent fifth subset does not change the four original fonts' contract.
It adds ASCII and the travel JSON/string-literal corpus, rejects unknown glyphs,
requires fontTools 4.61.1, preserves the upstream brush outlines and advances, and
fails at 1 MB. Initial output is 350,180 bytes / 579 codepoints. Only dynamic
encounter prose, choice captions, results and helper text use it. No synthetic
bold, glyph baking, merge, or system fallback. Unsupported decorative symbols
listed in coverage.json remain on the original navigation font. The reference
plate contains painted lettering; this is a close licensed dynamic alternative,
not a claim to have recovered its exact source font.

Only travel/assets/travel_brush.ttf goes into the delayed Travel pack. Never
ship the 5.6 MB authoring source as a runtime resource or Home dependency.
