# Shared speech component migration

All runtime character speech now uses `framework/addons/travel_core/ui/speech_bubble.gd` for content, font metrics, size reset, choices, safe bounds, tail, pop/reveal and closing. Travel's irregular warm oval is a renderer skin in `speech_bubble_shape.gd`; Home and Darkroom retain their existing thin anchor/exclusion adapters. Opening comic bubbles are real component children. `travel_speech.gd` is a compatibility wrapper with no second Label/Shape implementation. The rectangular diary and loading progress paper remain separate surfaces.

The shared fixed-slot layout establishes wrap width before resetting Label height, then reapplies the final size after Godot's deferred minimum-size calculation. Horizontal custom minimums stay zero, and Label line spacing matches the measured font. This covers both the former long-to-short horizontal offset and the initial zero-width vertical oversizing. Tail extent never enters content geometry. Shared strict font validation fails closed and disables choices when supplied glyphs are absent.

Travel's component forwards option indices and cancel events to its unchanged UID/token/CAS service flow. Choice controls stay disabled until the hold phase. Outside dismissal requires a matched down/up outside the interaction rectangle; canceled touch and focus loss cannot commit a choice. Reading settled results does not pause travel. The map reuses the approved 128px Home diamond texture, with glow/float/scale only on its child; the 46px input target remains fixed and handled markers become quiet.

Validation on official Godot 4.5.2:

- `test_shared_speech_bubbles.gd`: 209/209, 36 injected mouse/touch events; five real travel prompts/results, multilingual wrapping, long-to-short and resize, generic three-choice layout, opening's four components, Darkroom lamp exclusion, and three real stale-save/CAS scenarios.
- `test_round5_bubble_layout.gd`: 22/22; actual Home controls, centered short/long/narrow labels and scrolling.
- `check_production_input.gd`: 21/21; Home invitation through real bag input, cancel/outside and Darkroom return.
- `test_round5_travel_state.gd`: 535/535; route, AI, durable transactions and migration.
- Native Mesa llvmpipe OpenGL screenshots were inspected for five travel events and results, 390/540/720 widths, pending markers and the opening comic. This is software GL validation, not a target-device GPU claim.

The parent integration must regenerate its existing fixed font subsets and run the complete production build after combining other workers' script changes. This change adds no fonts or image resources and performs no deployment.
