# A004 普通道具抬升投影修复候选

仅修复已在 e394 正式九包确证的 A004：碗、娃娃、凳子上举时，原来始终按5px离地计算，接触带和投影跟着物件整体上移。其余 A003/A005/A013/A021 的有限基线结果保存在 baseline/，不据此宣称五主题全部验收。

## 实现

生产仅修改 home/interaction/home_interaction_controller.gd。视觉位置、拖动anchor、夹限、原固定home anchor、最高Canvas、饮水及归位路径保留。普通三件道具给投影使用独立floor anchor：上举时地面y保留原值，真实离地高度为该平面减去当前可见底沿；向下移动时允许沿地面移动而不产生负高度。现有settle插值使高度自然衰减，落地/取消恢复0高度和接触影。

没有修改鱼、grounding/shadow shader、原贴图、素材导入、资源包划分或香生命周期。上举指针35/90px，加上既有5px抓起间隙，真实影高为40/95px。红绿18个对应帧的source_transform逐一相同，视觉拖位未改变。

## 已取得的候选证据

- 同一个 test_prop_lift.gd、同一个官方Godot 4.5.2，空res根+实际App/native pack backend动态挂载；仅以_commit_home跳过无关格漫。
- 原e394正式包 RED：256项运行断言中63项失败，均为三道具×日/月/灯的高度、固定接地点或抬起接触带断言。预期失败被保留，没有把它改成静默通过。
- 单脚本候选 GREEN：255项全部通过。逐帧settle采样数随真实时序略不同，因此不要求与RED总数相同。
- 实际四边/中央鼠标拖放、触摸取消、失焦、720×1558真实root resize、满包+未读日记及浮动奖励回归：148项全部通过。
- 默认ambient饮水→恢复敲击及喝水中失焦取消→再次触摸敲击：16项全部通过；不靠测试手动重新开启ambient。
- 候选合计419个运行断言0失败；数量不是视觉达标数。42张red/green未缩放GL裁图与3张候选组合全图逐张查看，记录在visual_review.json。
- 43个尚未落地settle采样均保留临时Canvas。上举与回落的凳面花瓶、香炉在实际图中跟随原凳子变换，没有悬空分离。地图仅在角色离家显示，此时无可拖角色，不伪造该组合。

日间对照里碗/凳子的影子从紧贴上举物体变为留在地面，并随高度改变分离量；娃娃也出现对应的地面投影。月光与夜灯继续使用原有光照方向计算和较弱影色，没有为使截图更显眼而重写shader。落地接触alpha恢复0.19，足够高举时为0；水平拖动保持高度，向下拖动无反向投影。

## 包与资源边界

candidate.json记录官方编译链、6个只读编译依赖hash与生产源hash。测试core SHA256：4beee15a5da4e604136e62f71aadbb4a3ad60a9b83dfd90997243bf54a2d258c。

相对e394只有 home/interaction/home_interaction_controller.gdc 一个PCK成员改变，成员数量不变，新增运行资源0。八个原资源PCK通过只读symlink引用，原九包未修改。每次runner均核engine、测试脚本、输入九包的前后hash，空res内仅project.godot，0运行overlay、0物理生产源。

这是单脚本候选core的原生Mesa GL证据，尚不是关联组正式包验收。正式同源重包后须复跑本目录测试。没有验证Web/用户GPU/手机手感/听音/浏览器存档/内存/60fps，也没有代替用户视觉认可。

## 复现入口

在工程根运行build_candidate.py，传官方engine、e394 native_packs和新的空output目录，生成测试专用候选core。然后用run_review.py分别对原包与候选运行test_prop_lift.gd；原包应返回失败63项。候选再运行test_home_regression.gd及test_natural_drink.gd。run_review.py要求新的空证据目录，并自动结束自己的Xorg。

例：

    python3 build/home_grounding_review/build_candidate.py --engine /absolute/Godot_v4.5.2-stable_linux.x86_64 --packs /absolute/frozen/native_packs --output /absolute/new_candidate
    python3 build/home_grounding_review/run_review.py --engine /absolute/Godot_v4.5.2-stable_linux.x86_64 --packs /absolute/new_candidate/native_packs --output /absolute/new_evidence --pack-label A004-test-only-candidate --check-script build/home_grounding_review/test_prop_lift.gd

完整机器记录：verification.json、evidence/*/summary.json、results.json、render.log、command.json。基线34张原图仍位于基线报告所指的独占QA目录，本提交保留其hash清单、原始运行数据与精确测试脚本，避免重复复制图片。当前候选45张新图随本目录持久保存。
