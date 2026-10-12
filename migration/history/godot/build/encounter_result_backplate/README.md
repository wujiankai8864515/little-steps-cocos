# 奇遇后文字底板修复

用户事项：Sentinel_e0840b59fb3c8191ac5b357801302206。基线源码 b593735（765项产品输入与现网 5c37fb3 相同）。

唯一产品改动：`games/travel_woodfish/project/travel/travel_page.gd`，将既有 post-choice `_feedback` 裸字替换为同 canvas 下的手绘票纸和居中文字。复用实际 travel 包内 atlas 局部 `(12,430,488,80)`，无新增美术/字体、准入条目、每帧工作；不改选择、暂停、AI、关闭或 W6 动效语义。纸面显示560×88逻辑像素，内距34×20；实际字体度量可扩展多行高度，当前全部10条结果均完整显示。

- `evidence/baseline_gl`：精确现网R9正式PCK，零覆盖，8项确认缺陷的对照。
- `evidence/candidate_portable_gl`：官方编译单脚本候选，186项；真实 Native Mesa GL 输入和渲染。
- `evidence/candidate_headless_v3`：186项通过，明确 button signal 的 headless 生命周期检查，不能替代GL输入/画面。
- `evidence/candidate_gl`、`candidate_final_headless`、`candidate_headless_v2`：失败的旧测试路径，保留红证据；详见 `build/reviews/20261007_encounter_result_backplate.md`。
- PNG 为真实渲染截图，非浏览器实帧。完整截图SHA清单在 `evidence/all_captured_pngs.json`。

## 候选复现

先用 `python3 build/encounter_result_backplate/build_candidate.py --engine <官方4.5.2路径> --out <全新目录>` 生成显式两条目候选，再运行：

`python3 build/encounter_result_backplate/run_review.py --engine <官方4.5.2路径> --packs <正式PCK根> --out <全新QA目录> --overlay <候选candidate.pck> --gl`

## 关联组正式包回归

使用同一 runner，将 `--packs` 指向新关联组准确正式PCK根，`--overlay none --expect fixed --gl`。不得沿用旧候选包或将源码目录作为 res 根。

也可直接运行外部 `check_result.gd`，四个用户参数依次为 `<准确PCK根> <输出目录> none fixed`。fixture 不预加载产品源码，先挂传入 pack；runner记录11个PCK哈希并核前后字节不变及空res。`--expect baseline` 用于旧包，只确认裸字缺陷，不能用作修复验收。

正式构建、私有源码备份和发布仍由关联组整合处理。原生软GL通过不等于浏览器、手机、用户审美或硬件帧率验收。
