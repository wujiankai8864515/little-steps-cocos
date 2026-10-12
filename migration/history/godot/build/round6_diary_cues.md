# Diary artwork and review-entry cue

The open Home diary now has a generic postcard, ginkgo leaf, handwritten travel
snippets and pencil lines. All artwork belongs to the existing open-book sprite,
so its scale, skew, visibility and cancellation follow the actual two-leaf opening.
The helper reuses `Art.reward(2)`, `Art.reward(0)` and the existing brush subset;
there are no new PNGs, atlas pages, fonts or font characters. Its vertex-aware
ink receiver joins the existing room-lighting receiver list, including night light.

The journal's original painted review text, pen and underline remain visible.
After a review option is selected, a small warm-gold edge wash breathes around the
underline and nib. The disabled state has no active cue. Closing hides and stops
it immediately; refreshing, changing entries or submitting releases the old node.
No cue tween or hit target is added. The original `(330,939,251,53)` hit region and
`-0.08` rotation are unchanged.

## Integration

The task deliberately does not edit `travel_home_props.gd`, which is owned by the
parallel Home-props task. Add exactly this line in `configure`, after the props
sprite loop and before `textures.open_bag = Art.prop("open_bag")`:

```gdscript
receivers.append(preload("res://travel/travel_open_diary_art.gd").mount(sprites.open_diary))
```

The existing `_join_receivers()` and `_exit_tree()` own the returned material's
registration and removal. Do not mount a second copy on each opening.

The only `travel_page.gd` changes are the new `ReviewInkCue` nested class after
`var transition: Tween` and the `_journal()` submit-enabled branch. Encounter
methods, speech bubbles and `_process()` were not changed.

## Focused verification

`build/checks/test_diary_visual_cues.gd` ran in pinned official Godot 4.5.2 with
native OpenGL Compatibility rendering, an isolated data directory, current
committed scripts and the integration line above. Result: 40 checks passed,
0 failed, 22 real input events (mouse and canceled touch). Coverage includes:

- actual book release before page entry, both unfold phases, fixed local artwork
- day and night appearance; existing font coverage; lighting registration
- disabled submit, selection, breathing, unchanged hit region and single commit
- close/reopen, previous/next entries, already reviewed state
- canceled touch, interruption inside the unfinished book animation and teardown

Frames are paused deterministically at two mid-animation times for screenshot
capture; the input, animation and final page-entry callback are production code.

Evidence is under `/workspace/scratch/3f82ff2b3f81/diary_visual_cues_qa/final_render`:
`results.json`, `render.log`, `pixel_comparison.json`, and numbered full/cropped
frames. Selected-state frame differences are confined to the original pen and
underline. This is focused native evidence, not a full resource build, browser,
mobile touch device, or hardware GPU claim; the parent task owns the unified build.
