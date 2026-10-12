# H05 / A055：收藏工程落实

生产入口为 Home 百宝箱 → `travel_home_bridge.gd::open_page("collection")` → `TravelPage._collection()` → `travel/treasure_gallery.gd`。只有 `_collection` 改动，没有整文件覆盖其他地图/事件/日记函数。

## 本批验证结果

- 最终官方 4.5.2 无 PCK 原生构建：PASS，91 scripts / 224 resource references。
- 最终源码快照：`aba1cb53c51197eb7fbd456a1323090368a96d0fcc3e6d7ca04401d02a60a1c0`。
- 官方引擎 SHA256：`5803746bbe055bee0f07a3c5b0dd347719bd45599f3d34519a8a0beaf83014ae`。
- 新背景官方 lossless 导入逐RGBA核对 PASS；字体全生产语料检查和禁用系统fallback PASS。
- 真实 Mesa GL 输入/画面 41/41 PASS，日志没有脚本ERROR或泄漏退出警告。
- 资源准入 126 entries / 251,921,556 bytes；80 specs/batch、128 entries、256MiB门槛未改变。新增纹理 entry = 0。
- Home 首屏声明集合没有新增travel依赖；PNG复用原Art.PAPER，延迟travel包。最终整组新包下载总bytes须由正式包重算，不能把此前17,935,552B直接冒称新包实测。
- 新生产代码和背景与最终原生候选对应SHA一致，见 `evidence/final_source_match.json`。

## 画面与交互

原素材参考为已查看的两个新版收藏概念，Library ID和SHA见 `design/treasure_gallery/provenance.json`。背景由内置image_gen参考编辑产生，完整prompt见同目录 `prompt.txt`。最终空箱口提供真实动态道具位；场景背景已虚化，前景使用原游戏高精细四物 atlas，保持原银杏叶、玛尼石、照片、布偶身份。不是声称参考图的逐像素复刻。

运行图位于 `evidence/01_ginkgo_live.png`、`02_mani_live.png`、`03_empty_live.png`、`04_single_live.png`、`05_many_live.png`、`06_tall_live.png`，涵盖720×1280及720×1600。实物轻微浮动，文字和固定alpha点击目标不随之漂移。箱盖讲故事、前木牌计数/指引、日记纸签说明用途，公用返回悬挂牌继续独立接收真实输入。

收藏0/1/4/19件均已检查。多于4件时左右邻件始终可见，测试用真实鼠标逐件到第19件；没有中央icon目录或普通上一件/下一件按钮。左/右/Home/End键提供辅助导航。日记仍进入最新已归档日记，返回回收藏。库存快照只读，更新后按UID保持选中；同数量替换已经覆盖。没有新增装备/付费或改照片墙。

## 素材、字库和预算

- 新背景 `travel/assets/travel_paper_v1.png`：941×1671、2,158,346B，SHA256 `18371700eeded62f1b0f41c0dfe49094603d922353d8872a1371880bc3c9df42`；720×1280展示约1.31源像素/逻辑像素，背景有意虚化，无mip。没有声称2×设备DPR原生像素密度。
- `travel_rewards_v1` 保留旧1254² atlas，不增纹理。固定原CTEX SHA256 `2d994fcb8b3ebedfcc8092dac5ceb6821ea3cf487079e3c1171c2cc90f4fce31`。银杏源613×469、石518×373、照片625×601、布偶510×560，hero显示上限398×278并保纵横比，下方小物上限211×174；源区域全部沿用 `Art.reward`。
- 新画来源是用户批准参考的内置生成编辑；未导入第三方下载美术，也未宣称CC0或找回原画。已有reward素材沿用冻结恢复工程的素材来源与权限，不虚构新的开放许可。
- 文本沿用固定Noto/马善政子集与工程既有OFL许可证。`prepare_fonts.py`、`prepare_travel_brush.py` 均已重新运行并审核覆盖。
- alpha mask由固定CTEX的原透明度离线派生，无图像修改，无运行时GPU readback。196565B解码位图 + 7252B压缩量，准入按256KiB计，绑定原PAPER资源，不增entry。用 `python3 build/treasure_gallery/prepare_hit_mask.py --check` 可复核。

## 复现与整合

原生专项：用官方4.5.2、最终原生候选project运行 `build/checks/test_treasure_gallery_ui.gd -- <截图输出目录>`，需真实 GL 环境；`run_render_v2.sh` 可用。代码/资源修订后重新准备字体与资源contract，再按PRODUCTION执行无PCK预检。

整合只cherry-pick本H05独立提交。字体/coverage/resource_groups与其他并行工程若发生冲突，应合并本新增两个核心脚本与 `collection_alpha_mask` 预留，然后从整合全语料重新生成字体和资源contract；不要拿本分支旧全集覆盖别项新增资源。

正式组包需要父任务先推并读回冻结源码。其后从空目录运行：

    Godot_v4.5.2-stable_linux.x86_64 --headless --main-pack /absolute/native_packs/index.pck --script /absolute/repo/build/checks/test_treasure_gallery_cold_packs.gd -- /absolute/native_packs /absolute/qa/treasure_cold.json

必须设置隔离XDG_DATA_HOME/XDG_CONFIG_HOME/XDG_CACHE_HOME并确保可写。冷PCK脚本官方语法检查已通过；本批没有生成或执行正式PCK，冷/暖动态包、Web、GPU、实体触屏及浏览器内存仍为未验，待整组完成。不可用全资源native项目替代冷包验证。
