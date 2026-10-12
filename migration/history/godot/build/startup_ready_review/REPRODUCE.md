# Re-run only in new evidence directories

Inputs are frozen; no production checkout or overlay is needed. Pinned native engine and pack paths are in each run's command.json. run_review.py verifies official engine SHA and input PCK hashes before and after; it creates a private Xorg using the permitted display ports, records PIDs, terminates the engine/Xorg and removes Xauthority.

- Full 720 GL: run_review.py --engine ENGINE --packs PACKS --output NEW_EMPTY_DIR --pack-label formal-d1bfcaa --check-script test_startup_chain.gd --case slow_visual
- Cold/warm timing without PNG capture: same runner with test_startup_timing.gd and --case slow_warm_timing.
- Post-draw natural Loading samples: test_loading_contact_frames.gd and --case contact_visual.
- Headless states: python run_headless.py cold_normal warm_replay fail_login fail_comic fail_home. Each output name must not exist. This script contains the exact frozen absolute input paths for this workspace.
- Concurrent necessary packs: STARTUP_QA_SCRIPT=/absolute/test_parallel_startup.gd python run_headless.py parallel_slow_comic.
- Diagnostic only: test_home_prepare_diagnostic.gd with diagnostic_processing_disabled or diagnostic_render_disabled. These disable one Home subsystem before add_child and must never count as acceptance, even if route checks complete.

Do not run a second Xorg/GL case concurrently. Natural animation may skip sampling frames under software GL or PNG-save overhead; post-draw contact_frames.json records the exact sampled phase and frame, without forcing actor.frame. Do not interpret sample order as a continuous film.

The QA-only external dependencies are explicit: diagnostic extends timing; timing is its own copy of the base checker; contact extends the base checker. No production resource file is supplied by any QA script. Script SHA256 values are retained in each summary. The runner description was cleaned up after completed runs; original executed argv is preserved.
