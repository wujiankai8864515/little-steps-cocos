# Additional 20% pupil size on deployed 99d7abf

Production changes are limited to `eye_geometry.gd` and `home_face_receiver.gdshader`.
No original PNG, highlight, spring/damping code, texture region, eyelid or body geometry changes.

## Size contract

Relative to deployed 99d7abf, both ellipse axes are multiplied by 1.20 (area ×1.44):

- Left source radii: (10, 7.6) → (12, 9.12); nominal diameter 24 × 18.24 source pixels.
- Right source radii: (9, 6.6) → (10.8, 7.92); nominal diameter 21.6 × 15.84 source pixels.
- At 1 source pixel per logical screen pixel these are also the logical screen diameters. At a 360 px-wide projection of the 720 px logical scene, they become 12 × 9.12 and 10.8 × 7.92 CSS pixels. Physical raster dimensions additionally depend on viewport scale/DPR. Antialias support extends to 1.05 times the radii.

Larger ellipses require newly eroded center domains, not the old clamps. The left neutral center moves from (302.011686,189.454963) to (300.553125,190.350000); right from (424.002770,154.154491) to (421.700000,155.331250). Small shifts down/left and reduced boundary travel keep complete ellipses clear of the sloping lids. Existing damped target following is unchanged.

## Reproducible geometry and tests

`recompute_domains.py ORIGINAL_BODY.png OUTPUT_DIR [RUNTIME_RESULTS.json]` uses the exact shader-equivalent restored-white sampling in `white_reference.py`, a 0.05-source-pixel grid, and an elliptical erosion including 1.05× alpha support plus 0.35 source-pixel clearance. A conservatively contracted convex hull avoids bridges over non-convex original-white edges. The numeric verification samples every hull edge, interior center grid, optional actual 128-direction clamp endpoints, and 2,048 ellipse points per center. Required original-white guard is >0.99999.

`build/checks/test_round5_eyes_flowers.gd` runs the real clamp in 128 directions per eye, invalid-input behavior, damped convergence and neutral return (305 aggregate checks including existing flower checks).

`render_pupils.gd` runs with the assembled project and writes a real OpenGL/Mesa before/after comparison plus four edge directions. Copy the unmodified 99d7abf eye_geometry.gd into the QA project's `before_eye_geometry.gd` for the comparison only. It also compares actual rendered pupil alpha with the final eye-white guard enabled/disabled at neutral and all four extremes. Required clipped pixels: zero. Day/night Home frames establish the change in room lighting.

This is native software-OpenGL evidence, not deployed-Web, hardware-GPU or real-device DPI acceptance. The integrated source must still receive the combined final build and publication checks.
