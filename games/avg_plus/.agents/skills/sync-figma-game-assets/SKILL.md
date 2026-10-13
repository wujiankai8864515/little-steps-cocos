---
name: sync-figma-game-assets
description: Dynamically discover, validate, and stage Figma poker/card assets for explicit human review before safely promoting them into this Cocos Creator repository. Use when the user asks to sync, refresh, check, replace, approve, reject, or parse Figma poker faces, wild cards, card backs, or the project's 游戏资源 / 卡牌资源 directory; also use for review status, dry-run, promotion, discard, and pre-build review guards. Persist mappings by exact Figma name only, never by Figma node ID or Cocos UUID.
---

# Sync Figma Game Assets

Synchronize only the configured card resource group. Treat Figma as read-only, rediscover node IDs for every remote run, and require a stage → human review → promote workflow. Do not implement or modify game screens, dealing, hand evaluation, or other game business in this Skill.

## User-level commands

- Interpret no argument, `sync`, or “更新卡牌资源” as `stage`.
- Interpret `--dry-run` as remote discovery, download, and validation without creating a review directory.
- Interpret `status` as `review-status` when a review exists, otherwise verify promoted assets.
- Run `promote --confirmed` only after the user explicitly says “确认覆盖” or an equally unambiguous approval for the current staged batch.
- Run `discard-review --confirmed` only after the user explicitly rejects or asks to delete the current staged batch.
- Run `guard-build` before every build or release; stop when a review is pending.

Use `python3 .agents/skills/sync-figma-game-assets/scripts/figma_sync.py --help` for the deterministic helper interface.

## Stage workflow

1. Read `figma-assets.config.json`. Never embed its file key, source directory names, node IDs, asset names, card matrix, output paths, or review paths in code or prompts.
2. Parse the Figma file key from `figma.fileUrl`.
3. For each `sourcePath` segment, call Figma `get_metadata` on the current parent and run `figma_sync.py locate --depth <index>`. Match every segment exactly and directly below its parent; never search the whole file as a fallback.
4. Call `get_metadata` for the final configured directory and run `figma_sync.py plan`. Stop on an illegal name, duplicate name or semantic ID, missing card, unexpected prefixed component, or wrong size.
5. For every temporary plan entry, call Figma `download_assets` with the current file key and node ID. Honor the configured `downloadSource` exactly:
   - `singleRawImage`: require exactly one PNG in `rawImages` and label it `sourceKind: singleRawImage`.
   - `renderedExport`: use only `export` and label it `sourceKind: renderedExport`.
6. For poker, always select the single raw image. The rendered export is known to flatten a white background and does not match manual “PNG / 1× / transparent background” export.
7. Fetch at most four assets concurrently. Store signed URLs and node IDs only in the Git-ignored temporary directory. Never print complete signed URLs.
8. Run `figma_sync.py stage`. It must validate the full matrix, source kind, PNG signature, `162×243` dimensions, transparency, names, paths, and SHA-256 before publishing the review directory.
9. Stop after stage. Report the diff and review path, show useful sample images when possible, and ask the user to inspect the batch. Do not promote in the same turn unless the user had already explicitly approved that exact staged batch.

## Review and promote contract

- Publish the poker batch only under the configured `reviewRoot` path, currently `assets/art/resources/assets/__figma_review__/poker/`.
- Include all PNGs plus `review-manifest.json`, with exact names, review paths, formal target paths, dimensions, Alpha counts, semantic fields, resource paths, and SHA-256.
- Do not write the formal poker directory, formal catalog, or lock during stage.
- Refuse to stage over an existing review directory. Require promotion or explicit discard first.
- Treat the presence of any configured review directory as a build/release blocker.
- Before promotion, revalidate the manifest, complete name matrix, exact PNG set, dimensions, transparency statistics, and hashes.
- Promote changed/new PNGs, catalog, and lock in one rollback-capable transaction. Leave formal `.meta` files untouched.
- Remove the review directory only after a successful promotion. Keep it on validation or transaction failure.
- Keep stale formal files and `.meta` files; report them and never delete them automatically.

## Identity and persistence rules

- Use the exact Figma component name as the sole persistent identity and local PNG basename.
- Keep node IDs only in the ignored discovery/download plan. Never persist them in the review manifest, catalog, or lock.
- Never read, record, compare, generate, delete, or replace formal Cocos `.meta` UUIDs.
- Generate schema-version-2 catalog and lock objects indexed by exact asset name.
- Treat a Figma node ID change as no persistent change when name and bytes are unchanged.
- Treat a rename as a new name plus a stale old name. Do not infer identity from image similarity.
- Reject absolute paths, `..` traversal, symlinked review PNGs, duplicate output paths, unexpected extra review PNGs, source-kind substitution, and non-PNG files.

## Project contract

Read the [Figma card-assets module index](../../../docs/figma-card-assets/INDEX.md) first, then load the matched section of [sync.md](../../../docs/figma-card-assets/sync.md) when changing configuration, naming rules, review behavior, catalog fields, or the supported card resource scope. Keep team-facing details there rather than duplicating them in this Skill.

## Helper commands

- `locate`: resolve one exact `sourcePath` level from saved MCP metadata.
- `plan`: parse card component names and validate the configured completeness matrix.
- `stage`: download/validate exports and create a pending review; support `--dry-run`.
- `status`: report and revalidate a pending review, otherwise verify promoted assets.
- `review-status`: require and revalidate a pending review without changing it.
- `promote --confirmed`: transactionally update formal resources after explicit approval.
- `discard-review --confirmed`: remove a rejected pending review after explicit rejection.
- `guard-build`: fail while any review directory exists.
- `verify`: validate promoted name-indexed lock, catalog, dimensions, hashes, and Alpha.

If any helper validation fails, stop and show the exact error. Never fall back to screenshots, slicing, rendered exports for a raw-image group, old node IDs, UUID mappings, or partial synchronization.
