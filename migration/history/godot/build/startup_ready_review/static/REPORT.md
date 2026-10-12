# Frozen startup static audit

Read-only audit completed on 2026-10-06. Product/source/deployment/browser/account were not changed. Output is confined to this directory. No Godot process or GL test was started.

## Exact artifact identity

- Frozen source commit: d1bfcaa0bb4ddf2f9980e27e7fabd3b22d8b8b0c; release reports clean source.
- Source snapshot SHA-256: 904745318e53d4c356b4082395c06f86266655be77cac17f0e1fd61ade469f4d.
- Production inventory SHA-256: da21cb378012440129d3ca5a9ae24f3e617fbb530335e54c1a470000c3e37b47.
- All 9 native PCK files are byte-identical to frozen Web PCK files. Every actual directory entry passes its embedded MD5. All 461 members match path/owner/bytes/SHA-256 in production inventory. Every release-listed Web file matches size and SHA-256.
- All 17 examined startup source files match the frozen build source lock. Relevant prior compiler/import/scene-export evidence is copied under build_evidence_* and explicitly labeled historical build evidence.

## Useful result

A047 has static evidence for both requested removals while preserving the intended three static marks: the source scene has no halo/leading-dot draw nodes, frozen host has neither halo/dot markup nor draw code, and the actual core-packed clean background was decoded and pixel-checked. Actual packed background RGBA SHA-256 is 4b9a29794bcec5f9a72301eaf856b0663c0352032f9926102190b573c4b819ca, matching the lossless source and frozen import audit. Its host inline background SHA-256 is 648bd676a1976e8350a032f61528c9b4e9cc1d95517f595f8bf349ee9831ceca, matching no-halo provenance. Source/background/host poster pixels were viewed. No circular stroke/halo is visible in those inspected image assets.

A022 contact geometry uses the preserved host-origin actor script and three compact layers. Native layer CTEX hashes match the recovered original inventory. Frozen-host pure geometry evaluates to exactly zero mallet/doll anchor gap at frames 14/15, 28/29, 40/41; support drift over all 66 frames is only 1.14e-13. This is mathematical anchor evidence, not a no-penetration or subjective-animation pass.

Declared resources resolve from actual PCK remap/import members without missing files: Loading → core; Login → core + entry; Comic → core + comic; Home → core + house + exterior. Home's delayed packs total 18,127,008 bytes; travel, departure and photo are excluded from the declared Home closure. Recursive literal scene/script closure also resolves for Loading, Login and Comic (12/18/10 paths respectively). Dynamic paths and actual network requests still require the parent runtime audit.

A026 packed story manifest equals source and preserves the four exact lines: 借住一下 / 先喝口水 / 送你一点虚拟好运 / 剩下的，睡醒再说. The cited approval is Sentinel_d0d0b4b85b308191a63820f2a389637a; this worker did not independently fetch that conversation. The manifest expressly records that the individual generated panels were not seen by the user. The actual packed 1024×1536 four-panel paper was decoded and viewed. Story/asset implementation therefore does not establish user visual acceptance.

All seven topics' static findings and remaining gates are in topic_findings.json. The code supports staged readiness, hidden-then-ordered login entry, full-page hold before stable-hotspot breathing prompt, replay every entry, and 1/2/3 Home-wait dots. Actual cold/warm/browser/network/failure/cancel/focus/visual/audio results remain separate.

## Evidence files

- pack_integrity.json: all pack hashes, directory/member integrity and Web release-file hashes
- source_binding.json: startup sources to frozen source lock and compiled members
- resource_closure.json and entry_scene_closure.json: actual PCK resource membership
- loading_art_evidence.json, packed_image_inspection.json, loading_actor_origin.json: image origins, dimensions, alpha, decoded hashes
- host_contact_geometry.json: all 66 frozen host poses and contact/support checks
- story_provenance.json: exact copy, approval limits, packed short-audio ownership
- topic_findings.json: seven requirement findings and unverified boundaries

Do not mark browser/deployment or whole-topic acceptance green from this report. No live site was opened; offline release metadata's published=false is not a claim that the root's separately verified deployment is absent.
