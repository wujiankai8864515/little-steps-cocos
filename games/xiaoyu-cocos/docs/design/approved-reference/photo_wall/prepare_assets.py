#!/usr/bin/env python3
"""Deterministic runtime packing only; all painted content comes from imagegen."""
from pathlib import Path
import hashlib
import json
import shutil
from PIL import Image, __version__ as pillow_version

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / "games/travel_woodfish/project/photo/assets"
OUT.mkdir(parents=True, exist_ok=True)

def facts(path):
    im = Image.open(path).convert("RGBA")
    histogram = im.getchannel("A").histogram()
    return {
        "path": str(path.relative_to(ROOT)),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "bytes": path.stat().st_size,
        "size_px": list(im.size),
        "rgba8_sha256": hashlib.sha256(im.tobytes()).hexdigest(),
        "decoded_rgba8_bytes": im.width * im.height * 4,
        "alpha": {"zero_pixels": histogram[0], "partial_pixels": sum(histogram[1:255]), "opaque_pixels": histogram[255]},
    }

plate = HERE / "sources/photo_wall_neutral_plate_source.png"
runtime_plate = OUT / "photo_wall_neutral_plate_v1.png"
shutil.copyfile(plate, runtime_plate)

atlas = Image.new("RGBA", (768, 544), (0, 0, 0, 0))
specs = [
    {
        "name": "paper_frame",
        "source": "sources/photo_wall_paper_frame_source.png",
        "crop_xyxy": [40, 64, 1080, 1344],
        "atlas_rect_xywh": [16, 16, 416, 512],
        "display_max_at_dpr2": [208, 256],
        "photo_underlay_rect_local_xywh": [39, 42, 340, 386],
        "stamp_area_local_xywh": [64, 438, 288, 52],
        "note": "Outside and inner aperture use generated real alpha. Draw photo under the aperture; the bottom border remains blank for runtime stamps. No runtime curl, shadow, stamp, or text is painted here.",
    },
    {
        "name": "wooden_selector_clip",
        "source": "sources/photo_wall_wooden_clip_source.png",
        "crop_xyxy": [72, 52, 1408, 1054],
        "atlas_rect_xywh": [464, 16, 288, 216],
        "display_max_at_dpr2": [144, 108],
        "note": "One complete wooden spring clothespin, diagonal lower-left to upper-right. No tag, string, text, floor or cast shadow. Draw the two Home slot labels separately.",
    },
]
for spec in specs:
    source = HERE / spec["source"]
    im = Image.open(source).convert("RGBA").crop(spec["crop_xyxy"])
    x, y, w, h = spec["atlas_rect_xywh"]
    im = im.resize((w, h), Image.Resampling.LANCZOS)
    atlas.paste(im, (x, y))  # Copy RGBA verbatim; no alpha-composite over a matte.
    spec["source_sha256"] = hashlib.sha256(source.read_bytes()).hexdigest()
    spec["resampling"] = "Pillow LANCZOS, straight RGBA result, no background matte or alpha threshold"
    spec["packed_region_rgba8_sha256"] = hashlib.sha256(im.tobytes()).hexdigest()

runtime_atlas = OUT / "photo_wall_material_atlas_v1.png"
atlas.save(runtime_atlas, optimize=True)
manifest = {
    "schema": 1,
    "created_utc_date": "2026-10-06",
    "tool": "built-in image_gen.imagegen",
    "pillow_version_for_deterministic_packing": pillow_version,
    "prompt_file": "design/photo_wall/generation_prompts.json",
    "source_reference_role": "Approved static design used for composition and painted material style. Generated assets are reference-edited candidates, not a claim of original pixel extraction or complete runtime implementation.",
    "reference_files": [facts(HERE / "approved_single_page_neutral_reference.png"), facts(HERE / "approved_interactions_reference.png")],
    "source_files": [facts(plate), facts(HERE / "sources/photo_wall_wooden_clip_source.png"), facts(HERE / "sources/photo_wall_paper_frame_source.png")],
    "runtime_files": [facts(runtime_plate), facts(runtime_atlas)],
    "atlas_entries": specs,
    "base_plate": {
        "transformation": "Byte-identical PNG copy, no resize or recompression.",
        "canvas_display_reference": [720, 1280],
        "native_dpr2_display": [470.5, 836],
        "note": "At 720x1280 logical canvas this is 1.307 image pixels per logical pixel; the base alone does not establish full-canvas DPR2. It supports DPR2 up to approximately 470 logical pixels wide without upscaling.",
        "composition_720x1280": {"mat_center_approx": [214, 943], "floor_top_approx_y": 891, "fish_center_integration_suggestion": [205, 880]},
        "contents": "Warm plaster, white-flowered green vines, low wooden trim, wooden plank floor, one empty braided straw mat. No window, photograph, photo rope, clip, typography, plaque, character or paper stack.",
        "lighting": "Soft neutral warm material appearance. No directional light beam or hard sun shaft. Restrained intrinsic ambient/material shading remains; runtime directional lighting and shadows belong to the integrator.",
    },
    "package_intent": "photo_visual; integrator must assign to the actual delayed photo pack and ensure Home first load does not depend on this namespace.",
    "budget": {
        "runtime_png_count": 2,
        "decoded_rgba8_base_bytes": sum(facts(p)["decoded_rgba8_bytes"] for p in [runtime_plate, runtime_atlas]),
        "mipmaps_requested": False,
        "mipmap_bytes": 0,
        "admission_bytes_with_64k_each": sum(facts(p)["decoded_rgba8_bytes"] + 65536 for p in [runtime_plate, runtime_atlas]),
        "browser_heap_gpu_memory_measured": False,
    },
    "visual_inspection": {
        "date_utc": "2026-10-06",
        "references_viewed": True,
        "all_generated_sources_viewed": True,
        "packed_atlas_viewed": facts(runtime_atlas)["sha256"] == "4fac694bdcd65c9554fe48bed927dae9dc3b005b2f517de7c50c6ae9b2154b86",
        "packed_atlas_viewed_sha256": "4fac694bdcd65c9554fe48bed927dae9dc3b005b2f517de7c50c6ae9b2154b86",
        "packed_atlas_inspection": "Viewed after assembly with view_image. Frame aperture and empty atlas space are truly alpha=0; sample wooden clip interior alpha=253. No matte was introduced. Atlas-region RGBA hashes match the independently resized input regions.",
        "finding": "Generated plate removes baked UI, photo content and fish while preserving the approved vine/white-flower/plaster/floor/mat composition. Clip is complete with wood and metal spring. Paper frame has a transparent aperture and no text or content.",
    },
    "official_godot_4_5_2_lossless_import": {
        "status": "pending_integrator_verification",
        "required": "Import both runtime PNGs with pinned official engine, mipmaps disabled, no size limit; compare decoded RGBA8 base with runtime_files rgba8_sha256. This asset preparation does not claim importer, rendered game or dynamic light acceptance.",
    },
}
(HERE / "provenance.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"runtime": manifest["runtime_files"], "atlas_entries": specs, "budget": manifest["budget"]}, ensure_ascii=False, indent=2))
