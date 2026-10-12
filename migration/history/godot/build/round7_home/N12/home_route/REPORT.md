# N12 生产Home敲击链路补验（纯QA）

补足此前只做组件纯色A/B的边界。复用N27最终候选实际core/exterior/darkroom，其余正式基线PCK；不是新构建、没有runtime overlay、没有资源工程fallback。源绑定558108e，逐项hash和N27实际候选源码一致，见source_binding.json。测试没有改任何生产文件。

真实空res App冷Home，经native pack backend准备，跳过无关Comic展示。Test-only将现成merit_amount_provider设为1/2/10/100，review clock分别10/22点且保真实角色动画；不直接构造任何奖励控件，也不直接调用award或set_amount。根层touch+emulated mouse输入命中角色alpha → 原动画敲击contact → 一次merit_earned → 生产Home既有DynamicMeritAmount。每次检查输入启动/接触前零奖励/实际shader/复用同节点/金额事件一致/结束淡出/无二次结算，完成后恢复incense原provider。

73检查零失败；8个实际飘字完整Home实帧（+1/+2/+10/+100×昼夜），无损WebP逐像素与PNG核同，已查看两张全屏及全部8项原比例裁切对照。像素、shader和材质确实出现在真实房间光照背景上。全屏及contact_sheet仅QA证据，不把注入输入称手机触摸、不把Dummy音频称听音通过、不把Mesa称Web硬件表现。正式统一包/部署/Web/用户视觉验收仍待后续。
