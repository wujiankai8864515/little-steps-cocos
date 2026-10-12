# R9 旅行重复工作与暖开候选

基线：6327bdb，叠加照片8936f2f与既存三角化修复5c1a1ba。此项不改图片、字体、光束/落叶数量、分辨率、材质程序、声音样本、物理/动画公式及旅行时序。

根因/修复：
- 隐藏 TravelPage 仅 hide，子节点仍处理；改为页面关闭/初始时继承子树禁用，打开恢复。桥接业务 reconcile 不停。
- 页面背景和 EncounterGlow 的纹理绘制不随帧变化，却每帧重建 CanvasItem 指令；移除这两处逐帧 redraw，尺寸/内容刷新仍重绘，原 transform/modulate 动画照常。
- 每帧 snapshot 深拷贝全部旅行/库存/日记，只消费几个路线字段；新增无缓存、返回新字典的 route_snapshot，旧全量 snapshot 防御复制契约保留。
- 每次重开旅行重新逐样本合成两个声音；使用容量2、完整合成输入key的LRU，只复用不可变AudioStreamWAV，播放器仍每次创建并关闭释放。生产PCM157878 bytes与原版逐字节一致。
- comic 页面全域绘制不透明底色；仅停止完全被盖住的 Home SubViewport 重绘，Home world/共享钟/业务/物理处理全部继续。关闭还原先前 update_mode。collection仍消费实时Home纹理，明确不套用。

组件门禁10项全部通过：48组合时钟/选择暂停/释放待提交/恢复态投影及旧完整snapshot精确相等；返回字典改写不污染model；30轮复用同两份PCM，换配置正确重合成且cache上限2；隐藏/打开/再打开/释放播放器生命周期。夹具最初同一行lambda后多语句被收入lambda导致假时钟未赋值并形成测试引用环，已拆行；真实旅行生命周期需departure包的共享actor，已按实际依赖显式挂载后重跑。最终日志无ERROR和ObjectDB泄漏。

原生GL实测（同一官方4.5.2、Mesa llvmpipe、720×1280、原App真实控制器入口、原采样夹具+显式candidateoverlay）：
- photo暖开1362/1363 ms → 29.7/26.8 ms；首次5039→1560ms，绘制调用仍106；连续帧中位数约25–28→26ms，无稳态加速声明。
- travel暖开244/264ms→112/112ms；三轮帧间隔中位数74.1/78.5/83.8→29.3/28.7/29.4ms；draw-call中位数580/556/534→305/302/297。
- collection live背景保留：首开draw-call356→356，另两轮差异1/0，暖开仍约80ms，没有为了性能冻结背景。
- TIME_PROCESS监控值呈跨帧延迟/峰值滞留，不可把这些样本统计当逐帧CPU耗时；保留原始报告但不据此声称CPU倍数。

证据：build/performance_r9/runtime/travel/。报告及命令明确source候选覆层；不是正式构建、浏览器或手机性能。基线/候选运行时钟自然推进、OS磁盘cache不可控，不宣称目标设备60fps。

前两项补充像素门禁：6个固定光照/时相照片画面与6个旅行光束画面，基线/候选720×1280完整RGBA SHA全部相同，候选无ERROR，实际画面已查看。样例路径保留在 performance_r9_runtime_evidence/gl_equivalence_01，compact SHA报告随本提交保存；不将此QA补充当另一个产品修复。
