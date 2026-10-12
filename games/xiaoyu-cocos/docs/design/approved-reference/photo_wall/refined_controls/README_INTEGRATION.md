# 手绘控件与动态单字集成

此前规则几何纸底属于视觉实施缺口，不是获准占位。此目录提供真正alpha的破纸边、叶片、五金、铜环、折页及木纹控件。

`render_glyphs.py` 从已固定SHA/许可的 Ma Shan Zheng 2.003 原字体逐字栅格化96px字体；①②明确来自已固定LXGW WenKai，绝不系统fallback。原OFL在build/fonts/licenses，既有Web builder会复制。`photo_ink.gd` 按text字符串、glyph advance/offset/baseline动态排字；计数0–30和批次仍运行时更新，不是整句烘焙。

重现顺序：prepare_runtime.py（七图）；render_glyphs.py（29字）；prepare_atlas.py（控件v2）或prepare_atlas.py --with-hd（另项旧照清晰度v3）。保留原始PNG和全部提示供对照。v2仅启用控件/单字；同目录两幅HD画作是下一项接入的作者源，不代表v2已解决旧照清晰度。

新atlas替代旧atlas，不与它并列增加entry。最终上限1280×1280、RGBA相对768×544旧atlas最多增加4,882,432 bytes；背景不变。每次变更用官方4.5.2 lossless导入，实际get_image RGBA8 SHA与PNG逐字节核对；不靠声明证明像素正确。

原Photo1/Photo2 Home图源不替换；照片墙HD仅参考编辑增加清晰绘画细节，不声称找回原生高清像素，不改photo_id或既有库存数。
