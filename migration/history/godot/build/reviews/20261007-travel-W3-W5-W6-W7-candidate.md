# W3/W5/W6/W7 候选实现与测试失败复盘

基线6327bdb，正式整合目标为恢复的R9。所有组件跑官方4.5.2；没有使用PATH的4.6.3，没有触及用户Mac。正式冷包/部署仍待父任务整合，旧基线或组件数目不代表发布通过。

- 出发可见重复：源码明确二次emit_release。W3只保一次。原本已有的_confirm/service/_worn去重由真实HomeNote指针确认和异常时序检查保留，不以新timer掩盖重复。
- 首次调用正式assemble被干净源码守卫拒绝，原因是W3…W7尚未分项提交/新原稿未入Git。守卫正确工作、没有正式包产出。改为显式标候选的prepare_candidate.py，未绕过或修改正式守卫。
- W7初稿官方解析失败：从Node2D调用自定义anchor方法无法自动推导类型，已标Vector2；最终全112脚本解析0失败。
- 首次W7fixture将多个浮点delta相加到1.55时差一个亚微秒，落点几何已正确但尚未到完成回调；fixture补走0.001s检验最终态。不是用测试误差声称产品曲线失败或追加延时遮问题。
- 首次W6fixture固定跳至23.2s，但该seed首事件尚未到站，因此没有pending field。fixture改用真实首事件reached_seconds，真实pending按钮及点击通过。
- W6第一版36星在白天太弱，实际查看后未判通过。加强48轨迹、亮芯/拖尾和预置错相。后续长屏检查发现场景canvas只覆盖1280，改为整viewport；保留真实Button坐标转换。隐藏页process也明确停止。
- 最早手机截图把物理360×780当逻辑尺寸、夜间截图仅改clock而Home冻结hour又覆盖了它，均为夹具错误，不作为合格手机/夜景证据。最终使用root.get_visible_rect展开后的逻辑尺寸，实际set_review_hour(23)并断言共享clock=23，另有整viewport范围断言。
- W3最早fixture直接调用decision handler而未关闭原确认框，旧“好呀”框停留；最终通过HomeNote pointer_down/up真正确认，保存离开文案的有效画面。

有效证据：W3_gl03（真实指针21检查）；W5官方lossless像素及GL到站；W6最终field fixture的全屏/生命周期/点按；W7最终27项真实claim流程和坐标/中断场景。各项分列生产变更、资源、组件实帧、尚待冷包/Web；绝不将旧被否定视觉认定像素等价。
