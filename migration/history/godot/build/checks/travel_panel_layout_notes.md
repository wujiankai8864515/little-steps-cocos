# Travel paper UI regression (2026-10-06)

Changes are scoped to travel_page.gd and the travel_home_bridge.gd loading UI.
The approved map, transparent NPC atlas regions, diary and home bubble code are
unchanged. The encounter body is an irregular cream oval with a separate close
tab and a lower tail. All lettering is live text in the licensed Ma Shan Zheng
subset; it is not painted into a bitmap.

Old prompt rect: (324,492,293,86), center x470.5. Old result rect:
(308,583,308,77), center x462. No vertical centering. Close overlapped the
prompt's top-right boundary and long options were split by character count.

New prose/result safe column: x314..618, center x466. Prompt y501..588;
result y602..684. Both align center vertically and horizontally. NPC remains
(57,390,256,333); close has its own 44x44 hit region at (625,457). Prompt uses
28px, result 27px, choice 21px, helper 16px before metric-based fitting. Options
wrap through Godot's actual font metrics, not arbitrary character splitting.
Tail and close tab do not contribute to the content center.

Real Mesa OpenGL Godot 4.5.2 screenshots and tests covered all five event types,
both choices/manual and settled results; 390,540,720-wide windows; short/long
mixed CJK/offer/digits. Tests assert label bounds, shared centers and actual
line heights. Real mouse input checks close, reopen and choice submission.
Loading tests cover 72% byte progress, cancel, late completion after cancel,
failed preparation, retry, and 390/540/720 content widths. Loading is vector
paper plus the existing resident bootstrap font, with no new texture or Travel
font dependency. Gray test background was replaced by the existing Home room
texture for the final loading evidence.

Run `test_travel_panel_layout.gd` and `test_travel_loading_paper.gd` in an
assembled/imported project with a writable screenshot output argument. Their
terminal markers are PANEL_LAYOUT_PASS and LOADING_PASS. This is cloud software
rendering and input regression, not real Mac GPU/touch or user visual approval.
