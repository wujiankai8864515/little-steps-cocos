# Exact-pack page lifecycle comparison and resolved object audit

## Result

The exact final5c37fb3 and restored R8 PCK sets completed one warmup plus 20 measured loops through wardrobe, collection, photo, travel, journal, and darkroom using the same external fixture. Resource-gate pools remained bounded, every page opened and closed through actual App/controller APIs, and both App teardowns left one root Window and zero orphan Nodes.

The original exact-count node/object assertions failed in both builds and remain preserved. Follow-on diagnosis resolved their causes without changing product code, quality, timing, rewards, or the game clock:

- The additional 13 Nodes are exactly the naturally earned `PersistentVaseFlowers/Flower_1` subtree. Its 8 AtlasTextures and 1 ShaderMaterial account for 22 Objects total.
- The approximately one Object per page loop is a cached TextLine for the genuinely changing Home merit text, `功德 N`. Autonomous mallet contacts award merit; HeaderTag measures the new label with `bootstrap_ui.ttf`.
- An unchanged-default 75-wardrobe-cycle diagnostic naturally reached a stable pool: cycles 51–75 stayed at 3,992–3,993 Objects and 842 Nodes while merit continued to 74. No cache was cleared before these measurements.
- Only after all 75 measurements, a separately labelled causal probe cleared each font LRU. The bootstrap font's single-line cache released exactly 64 Objects, matching Godot's default single-line capacity. Its multiline cache released 4. This supports a bounded engine text cache, not unbounded retained page instances. No product fix or smaller cache was warranted.

This is a native headless lifecycle finding. It is not Web heap, GPU memory, target-device FPS, visual, audio-listening, or indefinite total-memory acceptance.

## Same-fixture 20-loop measurements

| Metric, settled Home after warmup | Final5c37fb3 | Restored R8 |
| --- | ---: | ---: |
| Gate entries | 107 throughout | 107 throughout |
| Gate batches | 7 throughout | 5 throughout |
| Gate estimated reserved bytes | 241,557,892 throughout | 241,557,892 throughout |
| ResourceCache monitor count | 236 throughout | 233 throughout |
| Detached/orphan-node monitor count during runtime | 248 throughout | 248 throughout |
| Scene-tree Nodes | 829 → 842, natural flower | 829 → 842, natural flower |
| All-Object monitor count | 3,921 → 3,962 | 3,957 → 3,998 |
| Direct static bytes | 347,939,372 → 348,248,020 | 347,612,078 → 347,899,798 |
| Linux process RSS bytes | 406,163,456 throughout | 405,659,648 throughout |
| Teardown tree Nodes / orphan Nodes | 1 / 0 | 1 / 0 |
| Teardown static bytes / RSS bytes | 69,775,776 / 383,983,616 | 69,193,010 / 383,479,808 |

The 128-entry / 256 MiB gate limits were unchanged; no gate rejection, failed batch, timeout, pending queue, or in-flight resource remained. Gate estimates are not whole-process memory. ResourceCache count is not a count of every uncached Resource object. Runtime detached page Nodes are not claimed to be orphan-free; only final teardown is.

RSS remained substantial after App teardown. This test does not establish that all allocator capacity or globally cached resources were returned to the OS. It establishes the observed page-loop pool behavior and Node teardown, not zero surviving Objects or baseline process RSS restoration.

The R8 run additionally logged one `Invalid polygon data, triangulation failed` at `travel_scene_runtime.gd::_draw_portal_shaft`. The final run did not log that engine error. The preserved node/object assertion errors are test assumptions now explained above, not silently deleted.

## Default-capacity causal evidence

`object_growth_resolution.json` contains all 76 settled samples, actual merit text, font instance ID/path/size, final per-font clear counts, and teardown.

- No-intervention plateau, cycles 51–75: 3,992–3,993 Objects, 842 Nodes, static memory 348,489,864–348,505,552 bytes.
- Plateau first/last static bytes: 348,505,428 → 348,504,528.
- Whole diagnostic RSS: 406,188,032 → 406,192,128 bytes. A 4,096-byte increase occurred at cycle 49; it then remained stable. It is not reported as exactly zero growth.
- Bootstrap FontFile instance in this process: `-9223372002629253727`; actual path `res://assets/bootstrap_ui.ttf`; merit Label font size 23.
- Default Font text-cache capacities are 64 single-line / 16 multiline in the official [Godot 4.5 Font source](https://raw.githubusercontent.com/godotengine/godot/4.5-stable/scene/resources/font.cpp). The same source shows cache misses instantiate TextLine / TextParagraph; [Font API documentation](https://docs.godotengine.org/en/4.5/classes/class_font.html#set-cache-capacity) describes the public capacity interface. Runtime observed single-line capacity was independently 64.

Product-side causal locations:
- `home/home_world.gd:311–315,711–718`: actual self-tap contact and one merit award.
- `home/home_page.gd:131–133`: merit Label text update.
- `home/header_tag.gd:39–44`: new text invokes Font.get_string_size.
- `home/flowers/flower_life.gd`: natural retained flowers, one per shared day, existing cap of ten.

## Reproduction and integrity

Run `python r9_final_lifecycle/run_repeated_pages.py all` from the workspace root after moving existing result directories aside. The runner refuses to overwrite evidence. Each build has its own fresh empty `res` directory and isolated HOME/XDG config/data/cache. It launches only headless Godot with `--max-fps 60`, `--main-pack <exact index.pck>`, and the external script. Dynamic packs are mounted through the real injected native pack backend and verified manifest paths. No candidate overlay or full-asset project path is used.

- Engine SHA256: `5803746bbe055bee0f07a3c5b0dd347719bd45599f3d34519a8a0beaf83014ae`
- Same-fixture SHA256 for the two formal comparisons: `78f697284ac00fc3979f715d298e4375bf7822951fc9d900b489303280ce07e1`
- Default-capacity diagnostic fixture SHA256: `cc4ed5143919ff460c837eedae25857e164988aaab7c4e0f714f4a8f7d3d1832`
- Each `provenance.json` records the exact command, engine/fixture hash, isolation paths, pack bytes/SHA256, exit code, errors, empty-res check, and post-run unchanged-pack verification.
- `actual.json` preserves all checks and samples; JSONL is the streamed raw record. The fixture retains only fixed-size aggregate statistics rather than growing copies of gate event histories.
- `source_guard.json` is only the static hidden-overlay gate; exact runtime commands and PCK hashes provide the complementary evidence.

Supplied final source identity was `5c37fb30fe088e998c414ed32a3e26fb551c2689`, with the parent-verified 765-input snapshot `bca6020c835ca69de74dc2ae514b31cd7377cd439592a30d979bc84d551a53f6`. This worker independently records actual tested pack hashes and does not substitute old pre-reset QA numbers.

## Preserved failures and boundaries

`FIXTURE_REVIEW.md` explains the original size-zero procfs read and retained-diagnostics memory contamination. Original v1 source/log/JSON remain unchanged.

The first reference-graph and first font-cache probe used an `is Object` type test on stale freed instances. Their errors remain preserved; those traversals are partial, not complete ObjectDB evidence. The valid font-causal-v2 and default-capacity probes first check `typeof(value) == TYPE_OBJECT`, then `is_instance_valid`; neither logged SCRIPT ERROR.

The first single-page isolation was interrupted to free CPU for coordinated timing work. It is partial, with no completion or teardown claim. Diagnostic fixtures inherited generic base-fixture scope text/teardown cycle labels; `diagnostic_scope_corrections.json` gives actual measured scope. In particular, the 75-cycle test is wardrobe-only after a six-page warmup, not 75 six-page loops. Actual loop bounds, raw cycle rows, and text inventories corroborate the scope; original files are not rewritten.

All native runs finished before the parent resumed paired timing work. No GL renderer was used by this worker.
