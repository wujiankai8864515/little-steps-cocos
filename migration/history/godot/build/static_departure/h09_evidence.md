# H09 出发四尖柔光

生产 `travel_home_props.gd::_draw` 的 departure 分支已复用驻留的 `home/feedback/assets/returned_bag_diamond.png`，删除原五星多边形绘制；地图、满包及奖励仍使用既有四尖纹理。资源路径/归属/计数/预估均无新增。

官方 4.5.2 原生 Mesa OpenGL，复制冻结561候选project并只覆盖该源码后运行 `capture_departure_glints.gd`。实际查看 `/tmp/godot_static_departure_qa/h09_retry/departure_four_point.png`，可见出发期间的四尖柔光。日志明确 age=1.8 和真实纹理路径。此项仅核出发光点；旧背包展示由H04随后替换，不将截图其余旧缺陷作为通过。非Web/设备验证。

初次采样按115渲染帧等候，在软件渲染中真实时间超过5.4秒，光点已结束；改为冻结动画年龄1.8秒后采集绘制帧，因此截图核实的是受控出发阶段，连续原速证据随H04交付。GLhelper退出trap已清理Xorg。
