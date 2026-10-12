# H03 / A007 原动作恢复与敲击间隔

本轮覆盖旧的快速映射方案；下方旧方案仅保留为回退问题的历史证据。

最新说明与已验证边界见 `build/strike_rhythm/README.md`。

---

# Woodfish strike feedback

This change keeps the original painted character/rig and retimes its existing
3.2-second animation. Only Home strike timing, contact feedback and focused QA
change; no new gameplay resource, art replacement, HUD or travel UI is added.

## Timing

- Before: nominal first contact 1.29 / 1.08 = 1194 ms; full action 2963 ms.
- After, player input: wind-up 135 ms, downstroke 65 ms, contact at 200 ms,
  first rebound by 290 ms, settled at 430 ms, full action ends at 580 ms.
- The automatic 3.2-second / existing-tempo interval is retained, so the faster
  visible action does not multiply passive merit production.
- Each player strike measures time since its own release with the monotonic
  clock. It does not inherit the previous frame's pre-input work. The 100 ms
  integration cap preserves readable poses during a severe stall.
- Every contact snaps to the original impact pose for one rendered frame and
  emits one sound, one merit event and one ink impulse from the same branch.
- The old three constant-width two-point lines only drifted and faded for
  280 ms. New tapered, crooked brush flicks expand over 35 ms, recoil through
  90 ms, then thin and fade completely by 190 ms. Other action glyphs retain
  their existing behavior.

## Verification

Run against the assembled production project with official Godot 4.5.2. Set
XDG_DATA_HOME, XDG_CONFIG_HOME and XDG_CACHE_HOME to writable isolated folders.
Use `--max-fps 60`; do not use `--fixed-fps` for timing or experience evidence.

```
Godot_v4.5.2-stable_linux.x86_64 --headless --audio-driver Dummy --max-fps 60 \
  --path ASSEMBLED_PROJECT --script REPO/build/checks/test_strike_feedback.gd \
  -- result.json

Godot_v4.5.2-stable_linux.x86_64 --headless --audio-driver Dummy --max-fps 60 \
  --path ASSEMBLED_PROJECT --script REPO/build/checks/check_production_input.gd \
  -- production_input.json
```

The dedicated test uses root input for six rapid restarted strikes, four
post-contact repeats, touch/emulated mouse deduplication, long-press drag
interruption, background/foreground, page pause/resume, bag-drag departure and
post-return striking. Only travel's long clock is injected after its real
farewell finishes. No strike animation uses a fast-forwarded clock.

`capture_strike_feedback.gd` records native viewport images in memory together
with Time.get_ticks_msec timestamps and saves PNGs after recording, so PNG
compression cannot stretch or interrupt the action being measured. The output
argument is a new frame folder; optional duration defaults to 3.5 seconds.
A third `half` argument records at 360 x 640 when useful.

The supplied real-time MP4 uses actual adjacent capture timestamps (duplicating
frames to encode at 60 fps), not a fixed frame-per-second interpretation of
uneven native captures. The local software renderer is Mesa llvmpipe; these
captures do not claim hardware-GPU smoothness or an audible sound review.
