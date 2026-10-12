# Five-visual-fix exact-pack performance and lifecycle evidence

## Conclusion for release

The bounded native checks found no new unbounded page/resource retention and no engine/script errors. Both same-fixture lifecycle runs passed all 267 checks, kept admission/queues stable, and ended with one root Window and zero orphan Nodes. Actual-departed controlled lighting was faster by measured median in both orders. These results do **not** establish a blanket no-regression performance pass: the natural-clock Travel first-open segment remained slower in the new build, by markedly different amounts across two orders. The current samples cannot isolate a causal new rendering regression from cold setup placement, natural scene changes and host variability.

The recommended decision is to retain that first-open uncertainty explicitly. Do not translate lower draw counts, these software-rendered timings, or headless memory into hardware/mobile/browser/60fps acceptance. No production correction was made or inferred from the uncertain timing segment.

## Exact source and test scope

- New source: clean `a0237fa78982b9df5732558a67a0630ec73abe93`, tree `25d542dbd4257574c26b3b97ec63b92b54617f4b`.
- Recomputed source closure: 769 inputs; SHA256 `6871179852c38ab9bbd83fe20f8fc1a3b3219d8d407523af7a1caba7999b9e72`.
- Private source-first backup receipt: `post_r9_backup_receipts/REMOTE_VERIFIED_a0237fa.json`, pass, recorded before formal build. This report verifies the receipt identity; the original remote backup operation is preserved separately.
- Compared exact eleven-PCK sets: `r9_verified_formal_5c37fb3/native_packs` and `post_r9_formal_a0237fa/native_packs`.
- Pinned official Godot4.5.2 engine SHA256: `5803746bbe055bee0f07a3c5b0dd347719bd45599f3d34519a8a0beaf83014ae`.
- Exact pack sizes/hashes, source identity, fixtures, engine, private-backup receipt hash and final unchanged verification are in `INPUTS.json`, `INPUTS_RECHECK.json`, and `SOURCE_INPUT_FINAL.json`.
- Recursive source guard passed for each fixture; external fixture dependencies and explicit overlay branches were inspected. App and lifecycle use the real injected native pack backend. Controlled lighting's optional overlay argument is exactly `none` for every run. Static guards alone are not runtime proof; exact commands, empty-res checks, isolation paths and PCK hashes complement them.
- Every process has fresh empty res and isolated HOME/XDG; maxFPS60 is a cap, not an achieved-rate claim. Mesa renderer: `llvmpipe (LLVM19.1.7,256 bits)`. OS disk cache was not controlled; known local GL/build/compression contention was excluded through the coordinated quiet window.

The verification scope was narrowed after the single first R9 Startup process. Final affected scope is one Photo R9→new pair, Travel R9→new plus new→R9 repeat, controlled Photo/departed-Travel lighting in both orders, and one paired lifecycle v2 run. That optional completed R9 Startup process is unpaired and supplies no startup comparison. No new Departure or unrelated route timing was run. Functional/visual acceptance is documented separately in FINAL_NATIVE_QA.json.

## Actual-App timing, natural game clock

The unchanged `r9_final_profile/run.py` and `profile.gd` drive real App/controller first-use and two warm entries. Inventory starts empty, persistence is disabled, no page clock is frozen or production process disabled. Comic is completed through its normal callback without story dwell. The legacy Travel fixture opens the empty-saved-state page; it does not replace the separate departed-scene diagnostic below.

### Photo

| Metric | R9 | New |
|---|---:|---:|
| First-use ready and drawn | 2978.620 ms | 2674.275 ms |
| First-open median / p95 | 52.525 /71.774 ms | 51.971 /67.834 ms |
| Warm1 ready and drawn | 59.931 ms | 55.058 ms |
| Warm2 ready and drawn | 72.933 ms | 96.502 ms |
| Warm1 median / p95 | 47.923 /59.262 ms | 49.228 /74.272 ms |
| Warm2 median / p95 | 54.589 /63.788 ms | 47.380 /53.069 ms |

First-open and most medians do not show a slowdown; one warm tail was higher, another lower. This short single natural-clock pair is descriptive, not a statistical guarantee.

### Travel: controlled interpretation of the concerning first segment

Columns always show R9→new values, including the reverse execution-order pair.

| Metric | Pair1, executed R9 then new | Pair2, executed new then R9 |
|---|---:|---:|
| Home-before median | 138.374→112.829 ms | 113.881→109.990 ms |
| Home-before p95 | 227.646→146.186 ms | 141.267→125.594 ms |
| First-use ready and drawn | 5858.551→3752.795 ms | 2774.018→3189.552 ms |
| First-open median | 68.703→103.130 ms | 61.497→65.652 ms |
| First-open p95 | 119.399→239.972 ms | 71.344→86.248 ms |
| First-open draw-call median | 301→78 | 302→78 |
| Warm1 median | 72.710→54.630 ms | 64.716→60.198 ms |
| Warm2 median | 61.943→59.972 ms | 110.062→64.335 ms |
| Entry +44 recorded interval sum | 9403.551→9552.923 ms | 5533.546→6155.436 ms |

The last row is derived from entry latency plus count×mean of the recorded first-open wall intervals. It is +1.6% and +11.2% respectively. Six settling frames and unsampled draw boundaries are excluded; it is **not full end-to-end elapsed time**. Arithmetic and boundaries are in `TRAVEL_CONTROL_ANALYSIS.json`.

The first-open segment is +50.1% median in the first pair and +6.8% in reverse, while new Home-before and warm segments are generally faster. R9 itself varied strongly: first-use5.859→2.774 s, warm2 median61.943→110.062 ms, and one startup sequence shifted time from first Comic to first Home. Therefore there is an unresolved repeat-direction first-open signal, but no isolated demonstration that the newly lit departed scene became slower. Fewer draw calls are not used as evidence of faster frames.

## Separate controlled lighting diagnostic

Unchanged source `build/scene_lightshafts/profile_lightshafts.gd` against both formal PCK sets, overlay `none`. The scene clock is intentionally frozen, page `_process` is manually advanced, Travel is actually departed, and each measurement has20 warm plus60 sampled frames. No image readback occurs during timing. This is shader/scene diagnostic evidence, not actual-App startup/entry or natural-clock gameplay timing.

| Scene and run order | R9 median/p95 | New median/p95 |
|---|---:|---:|
| Photo, R9 then new | 84.466 /187.512 ms | 79.882 /234.725 ms |
| Photo, new then R9 | 116.176 /222.833 ms | 47.397 /66.609 ms |
| Departed Travel, R9 then new | 68.183 /156.203 ms | 56.961 /103.770 ms |
| Departed Travel, new then R9 | 58.394 /106.100 ms | 49.781 /63.871 ms |

Travel measured medians were16.5% and14.7% lower, with lower p95 in both orders. Photo medians were lower in both orders, but its first p95 was25.2% higher and the second was lower. Large run-to-run variance prevents claiming a precise improvement percentage. Travel draw count309→85 and Photo106→106 are context only.

## Lifecycle: observed growth, not assumed allowances

Source `run_lifecycle_v2.py --new-packs EXACT_NEW --out NEW_EMPTY all` ran the same fixture on both pack sets. One warmup plus20 measured loops through wardrobe, collection, photo, travel, journal and darkroom. Both runs completed150 samples and267/267 checks, including strict opens/closes, unchanged128 entries/256MiB admission, idle queues, no failures/rejections/timeouts, and final teardown.

JSONL is streamed; running stats are fixed-size; procfs uses `get_buffer(65536)`; settled Home/teardown wait≥1.2s. No cache clears, clock freezing, manual texture release or exact node/object allowance was used.

| Settled Home, measured cycles1–20 | R9 | New |
|---|---:|---:|
| Gate entries /batches /owners | 107 /7 /1 throughout | 107 /7 /1 throughout |
| Gate estimated reserved bytes | 241557892 throughout | 241557892 throughout |
| ResourceCache monitor count | 236 throughout | 238 throughout |
| Detached/orphan monitor count | 248 throughout | 248 throughout |
| Tree Nodes | 829→829 | 829→842 |
| Objects | 3921→3940 | 3924→3965 |
| Merit | 2→21 | 2→21 |
| Flower-container direct children | 4→4 | 4→5 |
| Direct static bytes | 347945584→348127416 | 348073164→348376548 |
| Process RSS bytes | 406163456 throughout | 406798336 throughout |
| Teardown tree /orphan Nodes | 1 /0 | 1 /0 |
| Teardown static /RSS bytes | 69781112 /383983616 | 69908676 /384618496 |

The flower-container counter includes fixed support children; it is not a botanical flower total. At new settled cycle19→20, merit20→21, actual container children4→5, Nodes829→842 and Objects3942→3965. Through cycle19 the new build remained exactly3 Objects above R9, with one extra Object for each observed merit increment. R9 ended earlier without the container transition. The fixture records natural clock state; it does not equalize run duration by changing gameplay.

Flower, Home merit and text-measurement sources are byte-identical Git blobs across builds. Prior independently completed R9 causal evidence documents the natural Flower_1 subtree (+13 Nodes/+22 Objects) and bounded default font TextLine LRU. Current observed transition and merit sequence align with that unchanged mechanism. This is a state-correlated explanation, **not a blanket subtraction of old allowances**; all actual counts remain reported. `LIFECYCLE_GROWTH_ANALYSIS.json` preserves the transition, source identities and current samples. No new75-cycle test was run or claimed.

Photo, Travel and Wardrobe each retained one stable cached page instance ID across every settled loop; page dismissal does not promise page destruction each time. Final App teardown destroyed the Node tree. The extra2 ResourceCache entries and3 initial Objects in the new build were stable, not accumulating with entries. No unexplained newly retained page/resource growth was observed in this bounded window.

RSS stayed substantial after teardown, and the new process remained634880 bytes above R9. This is not evidence that allocator/global-cache memory returned to the OS, nor Web heap/GPU/indefinite memory acceptance. App-profile snapshot memory is not used as leak evidence; that legacy fixture retains diagnostic snapshots. The headless lifecycle fixture is the bounded-memory evidence.

## Failures, limitations, and artifacts

- The first external coordinator rejected the known Mesa unsupported-V-Sync warning after the optional R9 Startup game had completed with exit0 and zero fixture failures. Original coordinator, traceback, raw log, metrics and audit remain preserved. Only the external warning classifier was adjusted to allow that exact warning; all unexpected warnings and ERROR/SCRIPT ERROR lines still fail. See `HARNESS_REVIEW.md`.
- Across13 engine logs (7 App including optional Startup,4 lighting,2 lifecycle), no ERROR/SCRIPT ERROR appeared. GL logs retain the known V-Sync warning. Xauthority initialization messages are preserved in driver logs.
- The unchanged historical App profiler's `pack_metrics` row is empty because its optional `snapshot` method is absent. It is not represented as mounted-pack telemetry. Exact launch/backend roots, hashes, empty res, real resource-gate snapshots and lifecycle `snapshot_metrics` records supply the relevant complementary evidence.
- No source edit, new build, push or deployment was performed during these measurements. Source and fixture identities were rechecked after runtime work.
- Complete measurements: `APP_ENTRIES.csv`, `APP_FRAMES.csv`, `CONTROLLED_LIGHTING.csv`, `LIFECYCLE_SAMPLES.csv`, `COMPARISON.json`, `TRAVEL_CONTROL_ANALYSIS.json`, `LIFECYCLE_GROWTH_ANALYSIS.json`.
- Full raw run directories: `app/`, `lighting/`, `lifecycle/`; commands, isolation, guards, hashes, logs, raw JSON and JSONL are retained. `ENGINE_LOG_AUDIT.json` summarizes errors/warnings.
- Immutable fixture copies and hashes: `fixtures/`, `FIXTURES.json`. Reproduction coordinator: `run_verified.py`; reporting arithmetic: `summarize.py`. The original initial-warning version is separately preserved.
