# Home backpack gap and speech alignment

Base: 99d7abf83578dbbb625e31f8b497950540736095 (includes ec92 Home lazy-loading).

## Findings and narrow fixes

- Hiding all five backpack polygons still left the yellow wedge. It is the original actor's separate `OriginalTail` sprite/soft mesh, not skin sampled by the bag polygons. The backpack now tucks this independent tail in the worn pose and restores its original visibility when removed. The small near fin belongs to the unchanged body pixels and remains visible. No texture, UV, bag contour, attachment position, receiver shader or lighting parameter changed. Source visibility also makes existing alpha-hit and shadow-opacity code agree with the rendered pose.
- Speech was already center-aligned. A previous wide Label exported a fixed custom minimum width to its ScrollContainer. Assigning a narrower viewport was clamped to that old minimum, and deferred container sorting expanded the Label again. The paper and buttons shrank correctly while text retained the wide rectangle. The Label now exposes only its vertical minimum, leaving the scroll viewport in control of wrapping width. No font or global typography was replaced.

## Reproducible targeted checks

Use official Godot 4.5.2 with an assembled production project. Overlay the changed production scripts on a copy of the base project for targeted testing; the final integrator must rebuild the combined source and packages.

- `test_bubble_runtime_alignment.gd`: real deferred layout and shaped glyph bounds, short/long Chinese, repeated wide→narrow transitions, explicit two lines, choices, one-choice waiting, narrow safe rectangles, changed viewport widths and scrolling. It intentionally avoids a second `configure()` that would mask the old bug.
- `test_backpack_occlusion.gd`: repeated wear/unwear, interrupted wear/return, original body texture identity, approved five bag pieces, tail source visibility and tail shadow opacity.
- Existing `build/checks/test_round5_home_actor.gd`: real mouse/touch events, wearing invitation, cancellation/return, departure identity and shadow ownership. Updated projection expectations to honor explicitly invisible sources. Invoke this frame-count-based test with `--fixed-fps 60`; an unconstrained headless run advances too little simulation time and produces timing failures.
- `capture_home.gd`: actual Home screenshots in daylight, sunset, night, and unworn restoration, including the travel invitation. Runtime snapshots use software OpenGL/Mesa, not user-device GPU acceptance.

Scope is these Home visual regressions and shared speech layout. This is not a claim that the whole user journey, hardware GPU, mobile touch or deployed website has passed acceptance. The final package build, font/resource checks and Web publication belong to the combined integration step.
