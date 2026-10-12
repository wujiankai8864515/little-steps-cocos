# 出发显现云雾：独立候选修复（非 N27 归来开包）

## 触发、根因与真实改动
用户否定确认背包出发时静态背包鱼显现云雾，要求优先直接复用已认可暗室净化云。基线 197ee6c 的 home_departure_visual.gd 把旅行场景图集的 300×65 / 280×66 横向云条拉伸为五块 450–590×175–275 遮罩，形状比例与净化原画不同。

本项删除这五块云条，直接实例化现有暗室 flowing_plumes.gd；release.png、smoke_flow.gdshader、两团净化云的形状、流动、菱形闪光均不改、不复制、不新增美术。局部统一 1.4 倍缩放与 anchor 适配出发鱼位置。为保留已批准 4.8 秒出发流程，只对净化播放时钟作适配：首段 1.5 倍，末段从 3.15 秒启动并于 4.8 秒结束。Home 调用不再读取旅行云条图集。

保持既有 traveler 图、FOOT_PIXEL、ACTOR_SCALE、位置/漂移、原鱼淡出和静态鱼淡入时点、投影、保存与结算代码。没有重做背包拖拽/试穿，没有修改归来开包、公共气泡、字体、清单、构建或发布。

## 复盘与候选迭代
- v1 直接接连两次 2.85 秒净化动画，实帧揭示中段一直挡鱼；不能凭“复用成功”判通过。已弃用，改为首段 1.9 秒结束、末段 3.15 秒开始，中间留清楚显现窗口。
- 第一次 baseline runner 运行期间增加了测试断言，runner 的测试脚本固定哈希守卫正确报错。该轮不作为证据，冻结脚本后重新跑 baseline_final 与 candidate_final，两者均 exit 0 / 无 SCRIPT ERROR。

## 已验证与边界
官方 Godot 4.5.2（固定 SHA 5803746b…）Mesa llvmpipe 原生 GL。源码候选覆盖到历史 PCK 的现有环境/资源，13 个阶段 + 夜间云 tint 帧。5张关键原始 PNG 转 lossless WebP 保存，像素无损；其余完整原帧仍在运行命令注明的临时证据目录；image_hashes.json 保留原始 PNG 与交付 WebP 哈希。comparison.jpg 是查看用裁剪对照。

实际查看：0.76 秒交接被净化云遮住；1.8/2.2/2.85 秒背包鱼清楚可见；末段净化云遮挡淡出；4.8 秒云和鱼清空。断言覆盖所有采样时点无两条鱼同显、2.2 秒云空且鱼 alpha=1、4.8 秒清空、回退重置及释放节点。

这是视觉组件候选，未声称当前正式冷包、真实输入整轮、手机 GPU/Web 性能、用户验收已过。未为本项重跑背包试穿/拖拽；整合后的确认出发入口及中断/取消/重复确认仍由关联组包验证。夜间截图仅验证特效父 tint，不是整屋昼夜回归。

## 交根线程的资源集成要求
必须在真正确认出发后、begin_departure_actor 之前准备这两个资源：
- res://darkroom/assets/release.png
- res://darkroom/shaders/smoke_flow.gdshader

flowing_plumes.gd 已在 core_code，初始化没有加载贴图；贴图只在 emit_release 时读取。departure_visual 保留 travel_map_actor_v5.png，移除其不再消费的 travel_scene_layers_v1.png；旅行自己的云资源声明不动。不得靠之前进过暗室的挂包偶然成功。重算累计声明/阶段驻留、检查精确包归属与空 res 冷确认出发。此分支按协调约定未改资源清单。

## 提交完整性
普通 git add 因继承 sparse-checkout 定义拒绝本专项目录；立即停止提交并核实 write-tree 与基线 tree 同为 39cd55afbc12796cc649e822c39190a21d835bac，index 未变化。之后对明确范围使用 git add --sparse，提交前再核无删除/非预期文件。新工作树先 read-tree 固定基线并选择物化，没有用缺文件目录重建不完整 index。
