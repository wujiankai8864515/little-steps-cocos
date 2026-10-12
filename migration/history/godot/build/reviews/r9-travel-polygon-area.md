# R9 旅行体积光细片三角化错误

触发：未优化正式 6327bdb 的 native Mesa GL 基线真实旅行入口发生 `Invalid polygon data, triangulation failed`，堆栈为 travel_scene_runtime.gd:346 `_draw_portal_shaft`。原证据 performance_r9_baseline/gl_before_6327/travel/run.log；这是优化前既存故障。

确证根因：裁切在牌面边缘留下小于原有面积门槛的三角细片；`points[i].cross(points[i+1])` 对数百像素绝对坐标相减，float32 消减损失产生虚假有符号面积。原清理器误保留这些细片，后续引擎三角化失败。例如 (443.013397,313)、(443,312.925903)、(443,313)，实际面积约0.000496平方像素，绝对坐标累计却跨过原0.01双面积门槛。

修复：仅把面积计算平移到首点局部坐标。保持同一0.01门槛、原顶点/颜色、裁切、光束数量、alpha和动画；不吞错误，不盲目跳过所有三角化失败对象。微小退化对象按原设计门槛剔除。

复现/回归：find_beam_polygon.gd 使用传入的冻结或候选脚本、原场景配置及原裁切函数。冻结原版在99499个保留多边形内找到8个失败，保存精确顶点。候选完整扫描480个hour×4个age、443033个保留多边形，无三角化失败。证据 build/performance_r9/runtime/beams/。未改变任何资产。此提交的CPU几何门禁通过；同源nativeGL运行、屏幕像素与Web尚待整合验证，不宣称全绿。
