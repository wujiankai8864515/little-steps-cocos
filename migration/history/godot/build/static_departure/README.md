# H04 确认出发后整鱼背包与云雾

用户2026-10-06明确要求确认拖包后使用认可旅行静态整鱼＋包。仅这个阶段覆盖旧“出发永远保留同骨骼图”要求；确认前拖拽、取消、返家继续使用同一个原actor与原分层背包。

`home_departure_visual.gd`只负责画面：既有1774×887透明旅行图以0.35显示，足点保持world(350,951)；既有512² atlas的两片真实云图叠合扩散。0.76秒在云下移交可见性，旧鱼与新鱼永不同显；静态鱼自然出场、漂离，4.8秒清理。出发四尖光点由H09复用Home驻留素材，在新画面上层。白天和夜间实际截图已查看。没有新PNG、拉伸整鱼、重做骨骼或肩带。

加载与逻辑分开：明确确认才请求第8个`departure`小PCK（QA候选1,326,752B），准备成功才调用`service.depart`。App和Bridge双代际屏蔽取消/退出/晚回调；失败保留无旅途状态与重试。完成/中断清除sprite纹理引用，释放两项真实gate lease，并trim无holder解码缓存；旅行页持有同图时不会误释放。PCK本身保持已挂载，这是现有Godot pack服务行为，未宣称可卸载PCK。长帧越过5.4秒的旧age=-1边界也会完成清理，避免永久卡住。

Home冷包仍为17,935,552B，不依赖departure/travel；departure为2项/10,166,360B预留，含原绑定在atlas上的600,000B钟声保守预留。Travel batch仍为11项，显式包含2个共享图的独立租约；全union去重后126项/251,641,768B。80/128/256MiB限制不变。源图/导入缓存沿用冻结561，既有官方RGBA核验仍适用。当前候选仅重分既有资源，无重新压缩或旧缓存覆盖新图。

验证：
- 生命周期28/28，包括离线、取消、晚回调、重复确认、页面退出/重进、成功一次、返家原actor、6秒大帧清理
- 空res真实动态PCK14/14，真实missing-pack失败、SHA/挂载、加载时取消、重试、2资源gate租约与2项实际eviction、旅行独立租约
- 原生产真实输入21/21：鼠标与触控、拖包、确认前取消/外点回位等
- 加载契约单测6/6，4固定字体729码点覆盖通过，git diff --check通过
- Mesa原生GL逐阶段截图及夜间图已查看；MP4完整decode 263帧、720×1280、30fps、8.766667秒

MP4是Godot MovieWriter的生产动画1×播放时序，不是墙钟/GPU性能录屏。影片使用实际alpha命中拖包与确认按钮，145个连续出发状态样本无同时两鱼，动画自然结束。`h04_evidence.json`含路径与SHA。所有结果均未宣称Web/用户设备/GPU/手机触感通过。

冷PCK专项基于561的资源候选仍暴露已知无关旧错误：`travel_open_diary_art.gd:50`提前load未挂载travel_brush.ttf。H04没有静默掩盖它，也未碰日记实现；整合树负责合入对应修复后统一正式构建。候选不是正式PCK，不得发布。

复现：`make_cold_candidate.py --baseline-packs <冻结561/native_packs> --output <新QA目录> --engine <官方4.5.2>`仅准备QA输入；使用空res目录、候选index.pck及`test_cold_departure.gd`验证。实际连续录像使用`record_departure.gd`、`--write-movie ...avi --fixed-fps 30`。专项工程/缓存都位于/tmp，未修改冻结包或用户Mac，未push/deploy。GLhelper的Xorg进程由退出trap清理；最终无残留Godot/Xorg。
