# Round 6 visual corrections

Based on frozen 99d7abf, preserving ec92 deferred Travel loading and the 19,000,000-byte Home startup gate.

## Current integration

- Worn tail occlusion and common speech wrapping use the independently verified narrow fixes under `build/visual_alignment`.
- Travel encounter paper bubbles use a separately subsetted Ma Shan Zheng font. The four general UI fonts still cover the complete source; the fifth font is checked against its explicit Travel corpus. Content with excluded navigation symbols fails before export, and runtime labels reject unsupported glyphs explicitly. Both font source and OFL are pinned.
- Home long hints retain LXGW WenKai, with actual filled strokes emboldened by FontVariation. Opaque warm ivory fill, one-pixel dark edge, and a short neutral shadow replace the former 3px edge/5px amber halo. Four controlled day/night/lamp-on/off render captures distinguish unchanged unlit fill from perceived background contrast.
- Returned-bag and ground-map cues use one original 128px transparent four-point diamond texture, with independently phased breathing. Departure stars retain their existing artwork.
- Opening the bag emits 32 finite particles in four staggered waves from the physical mouth. Each particle has an independent cubic path, warm pastel tint, short moving tail and finite fade. The former 1145x1374 static baked-star spray remains source history only and is excluded from runtime packs and admission. No particle Nodes or Tweens are allocated.
- The ground map grows to 216x151 in the same lower-right region; diary and prompt have separate bounds. The click hit test follows the transformed real alpha mask, the entry bounce restores the exact transform, and glint phase survives page navigation.

## Validation utilities

Use the pinned official Godot 4.5.2 engine with the assembled project. Scripts in this directory use actual Home and root input; pass a fresh output directory after `--`. `record_spray.gd` captures real wall timestamps and encodes images only after the motion, avoiding PNG encoding stalls during recording. Concat-frame video preserves those timestamps. Software Mesa OpenGL rendering does not establish user hardware, Web, touch, audio or browser save acceptance.

Flower direction, 20% pupils, the detailed sign, header paper tags, diary contents/cues, shared speech and strike timing are now integrated; final combined regression is pending. The canonical 32-item ledger separately leaves 24–32 for phase two and 19/20 as design review. Intermediate commits are reviewable checkpoints, not publication approval.
