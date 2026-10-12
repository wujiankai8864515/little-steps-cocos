# Travel paper sign clarity

The approved sign's native source was a 175×96 crop from the 1672×941 three-state board. The effective sign is approximately 170×91 pixels, drawn at 1.38× in Home, so DPR2 asks those pixels to cover roughly 469×251 physical pixels. The old official import was already lossless, without a size limit; the default filter was linear. Neither nearest filtering nor a bitmap enlargement can supply the missing detail.

The larger `card_zoom.png` is consistent with a fivefold enlargement of the same board's `(740,570)-(940,690)` 200×120 crop. Comparing its 1000×600 pixels to a bilinear enlargement gives an 8-bit RGB mean squared error of 1.5346. It is not an independent detailed drawing. The reviewed design bundle and redesign directory contain the same 1672×941 approved board.

## Asset and placement

- A built-in image-generation edit reconstructed paper texture, edge detail, the brown woodfish, and the exact five-character wording 小余旅途中. This is a new detailed rendering of the approved design, not recovered hidden pixels. Its handwritten strokes are newly rendered; no system-font text is overlaid.
- `generated_master.png` is the complete 1693×929 RGBA generation, retained outside `project/`. `generation_prompt.txt` records the complete prompt and references. It never enters runtime packs.
- `home_tent_hd_v1.png` is a 768×421 downsample of that master, made with official Godot 4.5.2's Lanczos resize. It remains comfortably larger than the physical DPR2 sign. Original 175×96 crop and the approved board remain pixel-identical.
- UV corners fit the detailed paper to the original five world points. The approved contact `(359,926)`, source contact `(860,663)`, scale `1.38`, and hit polygon are unchanged. Front-plane triangles and the left fold are explicit.
- The original tiny crop sits underneath the detailed paper, restoring its dark bottom-left contact triangle and preserving the original external silhouette.
- The new PNG uses lossless official import, nine offline mip levels, and explicit linear-with-mipmaps filtering. This avoids aliasing when the detailed image shrinks to 1×; the source detail is the actual clarity improvement.

## Measured resource cost

| Resource | Size | PNG bytes | RGBA8 base bytes | With mip levels | Admission reservation |
|---|---:|---:|---:|---:|---:|
| Original contact crop | 175×96 | 32,096 | 67,200 | 67,200 | 132,736 |
| New detailed paper | 768×421 | 353,930 | 1,293,312 | 1,723,096 | 1,788,632 |
| Archived generated master | 1693×929 | 1,640,099 | 6,291,188 | not imported | not admitted |

The new imported CTEX is 373,858 bytes in the isolated official import. This adds one Home texture resource and 1,788,632 declared bytes. It does not add a runtime dependency on the mother board, generated master, or travel-page art. These declarations do not claim whole-process or browser peak-memory measurements.

Runtime PNG SHA-256: `6a1aa825f3efb6a2b06ab5d813b04487d661e62dc0bb8efe35cd0bb466d10328`

Generated master SHA-256: `221fe878c140d38e180b48139d3213ef2a16975c15d0fe915fad2de0450fd023`

## Verification

`capture_tent.gd` uses the production Home scene, travel service, props, and room SubViewport under official Godot 4.5.2 with real Mesa llvmpipe OpenGL. It captures the original and detailed textures at 720×1280 physical 1× and 1440×2560 physical DPR2. The room SubViewport independently reports both actual sizes. These are engine renders, not enlarged screenshots or composited mockups.

The four before/after crops here were visually inspected. Text and paper edges are visibly clearer, including at DPR2. Separate transparent engine renders measure exact silhouette equality: IoU 1.0 and zero changed mask pixels at alpha thresholds 0, 127, and 254 at both DPRs. Official decoded base pixels match the runtime PNG's RGBA8 SHA-256 exactly. The final render log has no script or engine errors (only the Mesa VSync warning).

`verification.json`, `render_report.json`, and `assets.json` preserve the measurements. Full Home renders, alpha captures, imported audit, and logs are in the sibling task workspace `travel_tent_clarity_qa/render_verified/` and `travel_tent_clarity_qa/import_audit.json`. `verify.py <qa_directory>` reruns the source/import/DPR/silhouette checks.

## Integration

The asset/Art/import-budget commit and the `travel_home_props.gd` commit are separate. Apply the small props diff around the tent construction block so unrelated light/interaction edits are preserved. The final integrated builder must regenerate the normal resource contract after combining other approved assets, then verify the full Home and pack limits. No deployment, remote push, or user-computer work is part of this task.
