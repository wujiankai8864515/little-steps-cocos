# 照片墙定稿风格控件与旧照片清晰化

2026-10-06。仅供父工程集成的作者资产，未修改生产代码或原有两张运行 PNG，未部署或 push。不要把 source/、references/ 或整张 contact sheet 放入运行包。

## 本轮交付

- runtime/title_paper.png：500×132，破边、折纹、棕金纸厚边，无字。
- runtime/hint_paper.png：560×98，两侧叶与不规则纸边，无字。
- runtime/oval_paper_tag.png：239×160，铜环、孔洞与纸标，无字。两槽复用一款。
- runtime/batch_folded_card.png：320×154，左侧折叠支撑面与空白正面，无字。
- runtime/counter_wood.png：320×79，木纹、细金边与两颗铜钉，无字。
- runtime/photo_torii.png、photo_blue_lake.png：均为480×512，同一原有照片身份的参考编辑清晰化内画，无旧纸框、夹子和外投影。

七张小图合计PNG 1,078,124 bytes；独立RGBA8面积2,900,800 bytes。最终整atlas按实际外框预算；这里不新增生产entry。每块入atlas建议至少2px外边距，由父工程负责。

文字安全区见assets_manifest.json的text_safe_rect_xywh；坐标相对各张runtime PNG左上角。安全区用作初始布局约束，具体文字与纸牌整体位置需在实际渲染中复核。

## 实查与来源

已读AGENTS.md、build/PRODUCTION.md、定稿设计交接说明，实际看过中性光定稿、当前720×1280首批绑定画面与两张原始256×320旧照片。使用内置image_gen，未用CLI/API替代。每张独立调用，全部prompt、生成源文件SHA和已持久化参考位置在prompts.json。

五类控件继承定稿纸纹、折痕、自然破边、侧叶或五金细节。无文字或数字，不包含光束或动态。RGBA透明已经过灰蓝实底合成验证。原始PNG部分透明像素的隐藏RGB呈棕色，直接忽略alpha的查看器会把它显示为光晕；真实alpha合成后没有这层光晕。未为掩盖它改写RGB或alpha。

全部source与runtime都已实际查看，runtime_contact_sheet.jpg是七图真实alpha合成检查图。单张照片参考编辑无法逐像素恢复丢失细节，属于保构图与身份的高清重绘，而非找回原高清底稿。鸟居初版多出第三根远右立柱，已通过第二轮指定编辑移除；运行候选用photo_torii_v2源。蓝山湖景保留原蓝紫高山、白云、湖面和前景灌木位置与色调。未生成新照片内容或新地点。

折页第二轮只是复查透明性时生成的重复候选且右边触画布，未选用。折页选首轮完整轮廓。其source alpha主体约253/255，极轻微通透继承自生成器，无大面积透明缺口。

## 可复现与边界

运行 python design/photo_wall/refined_controls/prepare_runtime.py 即可由已保存source确定性重建小图、manifest和contact sheet。程序只裁去透明空边并Lanczos等比缩小控件，保留原生RGB/alpha；照片对称小幅上下裁切到480:512，再下采样，不拉伸。

未修改glyphs/、render_glyphs.py。没有atlas打包、生产调用、官方Godot导入像素审核、最终字体/控件合成、GPU/手机或昼夜实际渲染验收，这些由主集成继续完成。sha256.json记录本轮所有源/参考/小图，assets_manifest.json单独记录选用的七个源与runtime hash。
