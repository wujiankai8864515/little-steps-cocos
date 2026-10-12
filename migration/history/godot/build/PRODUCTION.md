# Current production resource build

`original_export_inventory.json` and `baseline_gdc/` remain frozen recovery evidence.
The current builder derives a separate `qa/production_export_inventory.json` from
the source tree, declared logical groups, and exact official importer/compiler
outputs. Unknown file types or unassigned resource namespaces fail the build;
new files cannot silently disappear from the current nine packs. The `departure` pack
contains the two existing traveler/cloud textures, requested after departure
confirmation; the travel page holds its own leases on both shared resources.
The separate `photo` pack is requested when entering the photo wall. Neither
optional pack is a cold Home dependency. The generated manifest, not a historical
pack count in a report, defines the exact current topology.

## Prepare and build

Use the pinned official Godot 4.5.2 Linux executable and non-threaded Web template
documented in `README.md`. Python dependencies are `zstandard`, `Pillow`, and the
exact fontTools version in `fonts/requirements.txt`.

```sh
python3 build/prepare_fonts.py
python3 build/fonts/travel_brush/prepare_travel_brush.py games/travel_woodfish/project --output games/travel_woodfish/project/travel/assets/travel_brush.ttf
python3 build/resource_pipeline.py --refresh-contract
python3 build/assemble.py --engine /absolute/Godot_v4.5.2-stable_linux.x86_64 --output /absolute/new-native-output --packs
python3 build/web_candidate.py --engine /absolute/Godot_v4.5.2-stable_linux.x86_64 --template /absolute/web_nothreads_release.zip --native-build /absolute/new-native-output --output /absolute/new-web-output
```

These commands build an offline candidate; they never publish. Output paths must
be new empty directories. All editor, application, cache, and configuration data
are isolated below that output. Do not run these commands concurrently with edits
to the production source snapshot. Rerun font preparation after text changes.

`--verify-recovery` is an explicit historical comparison mode and should fail
against changed product behavior. It is no longer a prerequisite for current
production exports. Current builds still compile every script and require the
original App `LOADING → LOGIN → COMIC → HOME` smoke contract, resource parsing,
scene construction, production input checks, and actual loading from all packs.
The old GDSC comparison remains available in QA as evidence of intentional changes.

## Source and import policy

- Original runtime cache files are accepted only at their frozen inventory hashes.
- If an original source still exists and has the original source hash, its cache
  may be reused. Every new or changed available PNG/font is imported by the pinned
  official editor in a separate import-only project, then copied into the assembled
  project. A stale recovered `.ctex` or `.fontdata` cannot replace it afterward.
- New PNGs retain original dimensions and lossless pixels. No premultiplication,
  alpha-border recoloring, or size limit is applied. The decoded RGBA8 base level
  is hash-compared with the PNG. Only the scaled transparent travel actor,
  people, offering character, detailed paper sign, and the reference-derived Home backpack generate offline mipmaps.
  The old baked-star harvest painting is authoring history only and is excluded
  from runtime resources; the finite spray reuses one 128px diamond texture.
- Four fixed font subsets retain exact upstream Regular outlines/metrics and the
  original naming tables. Their shared coverage is the union of all source text,
  ASCII, and every recovered font cmap. Missing characters fail preparation.
  Imported FontFiles disable system fallback and have an empty fallback list.
  Source fonts, original subset references, exact licenses, URLs, and hashes are
  vendored under `fonts/`; Web packages receive those exact tagged licenses.
- The specialized Ma Shan Zheng encounter font has its own explicit Travel
  literal/content corpus, source/OFL hash pins, deterministic subset staleness
  check and packed glyph audit. Unsupported narrative symbols fail closed;
  decorative navigation symbols remain on the general UI font.
- Source/native resource profiles are `local`. The embedded Web profile is written
  only after all delayed PCK sizes/hashes exist. The host manifest additionally
  carries the core hash, avoiding a self-referential hash in `index.pck`.

## Admission and evidence

`qa/resource_admission.json` reproduces App group closure/filter rules. The limits
remain 80 specifications per batch, 128 entries, and 256 MiB reserved estimates.
For changed PNGs, estimates include RGBA8 base plus declared mip levels and 64 KiB;
for rebuilt fonts they include two subset-byte copies and 512 KiB. Recovered
resources keep their prior decoded estimates. Audio remains streamed.

These are admission declarations, not measured browser heap, GPU, or process
memory. Headless passing and exact pixel imports do not establish hardware GPU,
touch, visual acceptance, or browser memory passing. Important output evidence:

- `qa/font_coverage.json`, `qa/asset_import_provenance.json`, and `qa/imported_asset_audit.json`
- `qa/resource_admission.json` and `qa/production_export_inventory.json`
- unchanged `qa/original_export_inventory.json`, plus current token comparisons
- `qa/source_files.json`, `build_result.json`, and Web `release-manifest.json`

The source snapshot hash covers production files, pinned authoring assets/provenance under design/, build scripts/checks, pinned font
sources and licenses. Web release metadata discloses the current Git commit and
whether its source tree is dirty; the snapshot hash identifies actual input bytes.

## 第二阶段场景和穿戴资产

新包是认可旅行角色图的参考编辑分层候选，不是旧母板118×140裁片；加载契约核固定来源/hash、1254² RGBA及真正透明度，旧纸牌接地裁片仍逐RGBA像素核验。首屏19,000,000 bytes、不依赖travel、字体小于1MB等门槛保持。新的512²场景atlas仅属于travel_visual，其实际App准入额外计600,000 bytes原创钟声与播放缓冲预留。最终PCK必须重算，不能沿用组件预算。
