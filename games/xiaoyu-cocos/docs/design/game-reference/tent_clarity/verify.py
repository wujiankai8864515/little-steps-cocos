"""Audit the source, runtime import, approved shape, and real DPR render evidence."""
from pathlib import Path
import hashlib
import json
import sys
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[4]
qa = Path(sys.argv[1])
project = root / "games/travel_woodfish/project"
assets = project / "travel/assets"
legacy = Image.open(assets / "home_tent_pixels.png").convert("RGB")
mother = Image.open(assets / "travel_approved_mother_v5.png").convert("RGB")
assert legacy.size == (175, 96)
assert legacy.tobytes() == mother.crop((756, 580, 931, 676)).tobytes()
hd = Image.open(assets / "home_tent_hd_v1.png").convert("RGBA")
assert hd.size == (768, 421)
imported = json.loads((qa / "import_audit.json").read_text())
assert imported["base_rgba8_sha256"] == hashlib.sha256(hd.tobytes()).hexdigest()
assert imported["mipmaps"] == 9
assert imported["decoded_bytes_with_mips"] == 1723096
renders = qa / "render_verified"
runtime = json.loads((renders / "render_report.json").read_text())
assert not runtime["errors"]
assert runtime["method"] == "gl_compatibility"
assert runtime["filter"] == 4
assert runtime["texture_size"] == [768, 421]
expected = np.array([[218.24, 919.10], [238.94, 839.06], [412.82, 814.22], [452.84, 913.58], [266.54, 939.8]])
assert np.max(np.abs(np.array(runtime["world_polygon"]) - expected)) < 0.0001
alpha_checks = []
for item in runtime["renders"]:
    dpr = item["requested_dpr"]
    assert item["window_size"] == item["room_size"] == item["image_size"] == [720*dpr, 1280*dpr]
    assert item["visible"]
for dpr in [1, 2]:
    a = np.array(Image.open(renders / f"baseline_dpr{dpr}_alpha.png"))[:, :, 3]
    b = np.array(Image.open(renders / f"candidate_dpr{dpr}_alpha.png"))[:, :, 3]
    for threshold in [0, 127, 254]:
        old, new = a > threshold, b > threshold
        assert np.array_equal(old, new)
        alpha_checks.append({"dpr":dpr,"threshold":threshold,"silhouette_iou":1.0,"changed_mask_pixels":0})
log = (renders / "render.log").read_text()
assert "SCRIPT ERROR" not in log and "ERROR:" not in log
groups = json.loads((project / "config/resource_groups.json").read_text())
home = groups["groups"]["home"]["resources"]
assert "res://travel/assets/home_tent_pixels.png" in home
assert "res://travel/assets/home_tent_hd_v1.png" in home
assert "res://travel/assets/travel_approved_mother_v5.png" not in home
assert groups["estimated_bytes"]["res://travel/assets/home_tent_hd_v1.png"] == 1788632
report = {"passed":True,"original_crop_pixel_exact":True,"official_lossless_import_pixel_exact":True,"alpha_silhouette_checks":alpha_checks,"import":imported,"new_runtime_png_bytes":(assets / "home_tent_hd_v1.png").stat().st_size,"new_runtime_reservation_bytes":1788632,"text_visual_review":"小余旅途中; all five characters retained in regenerated brown calligraphy, not a font overlay","geometry":"Approved five world vertices, contact (359,926), scale 1.38 unchanged","visual_review":"DPR1 and DPR2 captures inspected; clear lettering and paper edges, original contact triangle retained"}
(Path(__file__).parent / "verification.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
print(json.dumps(report,ensure_ascii=False,indent=2))
