# #25 Home backpack layers: second-stage candidate

Base: 2a123d9c050ce0c5d9889ffada7ab3ae24b7957f. This is a separate candidate and is not published or visually approved by the user.

## Actual comparison and cause

The approved travel page displays `travel_map_actor_v5.png`, a 1774×887 transparent picture containing the whole fish, its large round near fin and the backpack/strap overlap baked together. Home previously used an unrelated 118×140 RGB mother-plate crop, split into five polygons and enlarged 1.73×. Its bag silhouette, buckle and detail are different; the near band was one whole foreground layer. The first-stage change hid the original tail protruding through the opening. It fixed that yellow wedge only. The old 118×140 backpack remains the published material until this candidate is separately integrated and published.

## Source and limited reconstruction

The built-in image-edit tool used the approved travel actor as its sole visual reference. It produced a 1254×1254 RGBA bag-only image: orange-brown leather, gold rectangular buckle/stitching/fasteners, fish emblem, carrying loop, upper connector and an empty shoulder loop. The fish and fin were removed; small hidden leather connections were reconstructed. This is a generated reference-derived extraction, not a pixel-identical crop and not a newly approved drawing.

The unchanged generated source is retained in `design/backpack_layers/approved_traveler_backpack_extracted.png`; `prepare_runtime.py` copies it byte-for-byte to the existing `travel/assets/home_worn_bag_pixels.png`. No source resize, recoloring or alpha replacement is used. Code-native UV partitions form shell, handle, upper connector, front curved band and rear lower return. Transparent seam padding retains background-layer dark/gold outlines. The foreground band keeps a tight source partition to avoid expanding the lower-return tab over the fin.

The existing Home actor/body texture, near fin, eyes, mallet and animation ownership remain intact. The source opening is anchored to the original near fin. Shell and connectors sit 22 logical pixels closer to the body; the front band's middle stays at the fin edge, with its upper/lower joins following the bag. Near band stays in front; shell/handle/upper connector/lower return stay behind the original body. Existing tail tucking and unwear restoration remain. No baked alternate fish replaces the Home actor.

## Budget and pipeline

- Same runtime resource path and gate entries: all-page union remains 128; limits unchanged.
- PNG: 1,185,585 bytes; official isolated QA `.ctex`: 1,268,894 bytes.
- Lossless RGBA base with offline mipmaps and 64KiB reserve: 8,449,608 bytes, replacing 131,616 bytes; net declared increase 8,317,992 bytes.
- Candidate Home batch: 69 specs, 105,636,160 reserved bytes.
- Candidate all-page union: 249,827,256 reserved bytes, below 256MiB. Other second-stage changes still need a combined check.
- PCK/Web were not built here. The isolated `.ctex` byte count is not the final Home download size; final package bytes and hashes must be checked by integration.

The resource pipeline explicitly generates mipmaps for this heavily reduced new high-resolution atlas. All five polygons use linear mip filtering. Generated source pixels otherwise remain exact.

## Checks and boundaries

`test_layered_wear.gd` checks high-resolution/transparent source, five UV layers, front/rear ordering, original actor/body identity, shell hit testing, original tail restore, worn actor+bag on the highest drag canvas, continuous departure/fade/cleanup and return. It records real GL frames at 720×1280 and 1440×2560.

`test_round5_home_actor.gd` uses real mouse/touch events for drag/release/cancel, ordinary bag-wearing invitation, departure identity and projection ownership. The opaque shell sample now comes from the rig instead of hard-coded old atlas coordinates. Use `--fixed-fps 60` for its frame-count-based timing.

`capture_worn_resolution.gd` records the candidate in daylight, sunset, night and restored unworn Home at requested output scale.

Remaining visual decision: the user must judge the new material's closeness to the approved travel bag and its contact/strap fit around the original Home fin. Home's original fin is smaller and differently shaped than the baked travel fin; the candidate deliberately preserves it. Native Mesa/llvmpipe screenshots and state tests are not deployed-Web, hardware-GPU, real-device-DPI or user aesthetic acceptance.

## Offline alpha hit data

After changing the runtime PNG, run the pinned engine with `prepare_alpha_mask.gd -- SOURCE_ROOT`. It embeds `approved_worn_alpha` in the existing `backpack_parts.res`, preserving the original hanging mask bit-for-bit. The generated file is committed; production only loads it from the already-ready Home resources. Both image masks fit the updated 409,600-byte reservation without adding a gate entry. `test_alpha_hit.gd` must pass for the new texture. It uses barycentric inverse UV mapping of the fitted geometry, not a bounding box or unwarped texture lookup.

## Worn contour projection

The worn bag now has five fitted alpha/UV `ArrayMesh` sources and ten natural/lamp pass nodes, using the existing `home_grounded_shadow.gdshader` / AlphaGrounding projection convention. This adds no texture or gate entry. The meshes share the exact visible-layer vertices and atlas mapping; their alpha holes stay empty. A worn pack is suspended, so it receives a floor contour projection without an invented physical contact strip.

The passes stop while carried into the highest canvas, lifted, unworn, hidden or under `no_shadows`. Departure updates the same bag pose and projection opacity in the actor update call. Floor-stable frames reuse the same five meshes. `test_worn_projection.gd` tests actual rendered pixel contribution, alpha-vs-filled-geometry negative control, daylight/moon/lamp cases, carry/unwear, opacity and continuous departure.

Resource admission adds a conservative 256KiB renderer-object allowance to the existing bag spec for five mesh objects, ten pass nodes/materials and bookkeeping. The 5,160-byte raw vertex/index payload alone is not a total-memory estimate. Hardware/Web memory and final package admission remain integration checks.
