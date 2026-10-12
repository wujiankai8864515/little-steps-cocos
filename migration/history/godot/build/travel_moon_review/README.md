# A075 月弧与方向性接触影候选

生产只改 travel_scene_runtime.gd。以 Home 同一60秒Clock的20→4夜相位驱动左→右月弧，午夜不复位。任何可见月光都给出反月方向的地影；19.5–20/4–4.5只收缩地影偏移/旋角为接触影后换源，避免弱月阶段被不可见太阳误导。既有太阳弧、色调、beam、配置、图层与资源不变。复用原moon锚与可选moon_arc_height参数（默认24），未新增配置字段。

- 正式基线：bc1f8cf九PCK，源码修复祖先0078c5a。没有改动正式输入包。
- 最终候选：candidate_v2/A075_CANDIDATE_ONLY.pck，仅runtime.gdc和已有remap两个替换entry，没有新增正式entry/资源。
- 最终实页GL：candidate_v2_gl/results.json、transition_summary.json、summary.json与20张原始JPG。
- 昼间无回退：raw_rgba_daytime_comparison.json。5/8/12/18/18.5五张720×1280帧在两次真实GL运行中Image.get_data()的RGBA8 SHA-256逐一相同，每帧3,686,400字节；JPEG仅展示。早期JPEG解码比较文件已明确标注不能证明raw equality。
- 视觉索引：final_night_contact.jpg为最终23/0/3/20.1/3.9整页缩图及人物地影局部；各原图保留于candidate_v2_gl。
- 基线红：baseline_gl保23.99/0/0.01及5/8/12/18/18.5等原图；baseline_headless_final_v2用最终严格夹具仍有六项失败。
- 中间红：candidate_gl虽然通过先前有限判据，严格弱月检验intermediate_headless_strict仍红，不可交付。保留candidate/intermediate_runtime.gd及旧delta。
- QA误差与修复复盘：../reviews/a075_travel_moon.md，不把夹具错误当产品错误。

运行：python3 build/travel_moon_review/run_review.py --engine <官方4.5.2路径> --packs <精确九PCK目录> --out <新空输出目录> --gl [--overlay <candidate_v2/A075_CANDIDATE_ONLY.pck>]

构造候选：python3 build/travel_moon_review/build_candidate.py --engine <官方4.5.2路径> --reference-build <原工程build路径> --out <新空输出目录>

夹具使用正式App冷加载、真实Home bridge与Travel Page，验证同一Clock对象。seek_hour只用于确定性取帧，暂停动画保证日间像素可比，未修改生产时钟源。另用实际App/Scene前后台通知与真实dismiss核有限生命周期。副本只有两个待编译脚本、小空res和小delta，不展开完整生产工程。

本证据限定原生Mesa llvmpipe 720×1280。不是用户视觉认可、Web/手机GPU/60fps或全历史A075验收；尚需关联组GitHub同步核验、同源正式包与部署验证。

原始RGBA对照可用同一运行命令加--raw-days；该模式只采五个昼间时段，不重新判定夜间失败/通过。最终夜间及生命周期依据candidate_v2_gl，而不是这个范围更窄的RGBA补采。
