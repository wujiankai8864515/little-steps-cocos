# 暗室高屏扩边来源与固定制作

原房间从冻结56193b7暗室PCK以官方Godot `Texture2D.get_image()` 取回，实看后作为参考。原图941×1672，中央有真实透明窗洞。原中央全部RGBA保持逐字节相同；只生成上方木墙、下方木地板，最终只导入同一资源路径 `darkroom/assets/round2/room_no_plants.png`。

选用内置image_gen；没有使用CLI/API密钥。两张原始生成输出分别为1774×887，未直接作为运行贴图。准备输入是1024×512：上边目标的下209行放原图顶部192行的等比例副本；下边目标的上209行放原图底部192行副本，其余303行透明待扩画。

顶部实际提示：

> Precise game texture outpainting. Output same 1024x512 layout as the input. The lower 209-pixel region is the existing painted wooden wall and top of windows. Preserve that entire lower existing region exactly in position, color, scale, structural lines, and its transparent window holes. Paint only the blank transparent upper 303-pixel region. Continue the same existing dark brown timber wall planks and supports naturally upward from the EXACT boundary at y=303; align each plank's dark outline precisely to the original lower region, carry the wood grain into the new area. The extension is just wall, with no new window, furniture, ornaments, props, objects, labels or text. No ceiling perspective or new ceiling needed. Fully opaque wood to the uppermost row. Warm hand-painted game illustration, visible varied wood grain and natural joints. Do not blur, mirror, stretch a tiny strip, recolor, shift or rescale the existing lower wall. This will be spliced directly above the original wall, so exact boundary continuity is essential.

底部实际提示：

> Precise game texture outpainting. Output same 1024x512 layout as the input. The upper 209-pixel region is the exact existing warm painted wooden floor. Keep that upper region exactly unchanged in position, scale, color, texture and plank boundaries. Fill ONLY the blank lower 303-pixel region by naturally continuing the floor down toward the viewer from the EXACT boundary at y=209. Every longitudinal floorboard seam must continue from its exact x-coordinate and diagonal direction at that boundary. Maintain the existing converging perspective, plank widths, dark painted edges and warm brown grain. Include restrained realistic plank cross joints and knots so it has true physical floor content, not stretched pixels. No mirrored perspective, blur, new objects, furniture, leaves, labels, text or other props. Fully opaque to the bottommost row. The new lower floor will be spliced directly below the original, so precise seam alignment and unchanged color at the join are essential.

`source/` 中保留原图与两张入选生成原文件，SHA256固定在prepare脚本及provenance.json。完整房间首版扩图因边界透视不准被弃用，没有混入运行图。

离线重建：`python3 build/darkroom_edges/prepare_room_edges.py`。需要已有Pillow/numpy；不联网、不生成新图片。脚本从固定生成文件截取真正新绘边缘，缩为各941×139，将其追加在原941×1672后，成为941×1950 atlas。在新条带接缝附近仅8行做逐列RGBA差值渐消校正，没有邻域模糊，也没有修改中央。原画最外行本来有非255 alpha，接缝继承该alpha，之后过渡到新增木材的不透明区域。

运行时原Sprite2D启用region，仍以原区域和原scale绘制；RoomBleed按额外高度揭开靠近接缝的真实木材画面。每侧139源像素覆盖256逻辑像素的边缘，1558画布每侧显示139逻辑像素，1800每侧260。标准画布不绘扩边。无mip，沿用项目原纹理过滤；没有nearest锐化。实际像素/导入/昼夜对照在 `build/darkroom_edges/evidence/`，DPR与手机观感不从软件GL推断。
