# Reproduce bounded formal-pack QA

Use a new empty output path per invocation. Official inputs stay read-only. Keep sequential execution and avoid overlapping any GL or timing profiler.

```sh
python audit_pack_sources.py
python run_review.py --engine /workspace/scratch/3f82ff2b3f81/godot_reconstruction_assessment/toolchain/Godot_v4.5.2-stable_linux.x86_64 --packs /workspace/scratch/3f82ff2b3f81/home_grounding_formal_d1bfcaa/native_packs --output /new/empty/real-output --pack-label formal-d1bfcaa --case real_cycle --check-script /workspace/shared/clock_flower_cycle_qa/test_clock_flowers.gd
```

Fixture mode needs legacy5.json next to the checker and a new shared-data directory. Run `--case fixture` then `--case reload` in distinct processes with the same `--shared-data`. The checker currently resolves the verified first process expectation from `fixture/saved_expectation.json` next to the checker. For a new reproduction, prepare a new external QA directory and use that exact sibling layout; never overwrite the original evidence.

The runner enforces official engine SHA, all input PCK hashes unchanged, empty res root, no resource overlays, native backend, max-fps60 with no fixed-fps, full 720×1280 canvas and isolated Xorg/HOME/XDG. Scene routing and generated/saved states are declared in the checker and report. Review actual resulting frames before stating visual findings.

The real_cycle result used script_corrected_v1.gd (its hash matches that invocation); current test_clock_flowers.gd only adds the zero-delta pose fix on fixture branch. Both retained parse/unposed failures have their original corresponding script. Original command files preserve exact invocation parameters and per-run engine/Xorg exit records. Two successful persisted-fixture processes are fixture and reload; failed fixture has a distinct data directory and cannot contaminate them.
