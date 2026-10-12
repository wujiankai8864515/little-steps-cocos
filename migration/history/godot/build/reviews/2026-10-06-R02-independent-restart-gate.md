# R02 跨进程冷恢复门禁

旧round5_app_journey在同进程重建Home，全部资源已经挂载，不能证明真正退出再进入的冷恢复。本次保旧74项真实整链结果，另准备三种独立进程seed→exit→new App：CHOICE_PAUSED遗留锁、已收一件/其余浮物、FLYING未完成。seed用生产Service/Store写实际磁盘，3场景21条seed断言已在精确561 core/Home包通过。restore阶段必须在新组正式包后执行，当前未记通过。

新增runner不会加源delta或copy资源，每个scenario独立空res根及XDG目录；seed/restore分别启进程。新App走实际backend size/hash/mount，断言不提前拉travel/departure/photo、trip/reward UID保持、偏好/终点AI/库存计数不重复、未收浮物和日记保持。仍不等于浏览器localStorage刷新通过。

## 正式a297包发现测试采样问题

paused/partial两个新进程场景通过。FLYING恢复里，模型提交后库存/UID/AI/学习均正确，字典数量断言却早于普通节点的下一帧清理。实际观测：提交当帧已收sprite alpha为浮点0（-2.22e-16），视觉已消失，字典暂有3项；两个process_frame后为2项，未收两件仍浮。此为SceneTree.process_frame先于Node._process的采样时点，不应改奖励/存档逻辑。

测试改为先检查已收物件当帧不可见，再观察两帧正常清理后的字典数量。用同一正式PCK从新seed→另一进程restore实测13项全过，原失败结果保留。此提交只改测试与证据，生产脚本/资产字节不变。后续重出同源包时须验证运行成员全同（仅build_info/source标识可变），并再次运行新三路重启门禁，不能悄悄把旧红报告换绿。
