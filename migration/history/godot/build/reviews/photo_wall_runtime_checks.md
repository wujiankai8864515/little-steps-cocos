# 照片墙迭代验证问题

1. 初次直接headless调用未隔离XDG目录，官方引擎因只读用户目录创建日志失败并退出。测试启动方式已修复为专用/tmp/photo_wall_state/{data,config,cache}，重跑20项状态测试全过。
2. GL01页面错误使用不存在的body_font.ttf，系统fallback显示了文字，但不能视为合格。修复为Home已加载且有固定许可证/全字覆盖的travel_ui.ttf。后续日志必须零资源错误。
3. GL02 picture_corners的typed Array接收ternary未类型化数组触发运行时错误，纸片未完成初始化。修复局部类型为Array；不能只采信场景输入断言PASS，日志SCRIPT ERROR和每片surface/shadow对象初始化也必须核验。GL02为失败候选，不作视觉合格证据。
4. 构建期间source_changed已单独记录于photo_wall_candidate_01.md。任何最终验证必须重建不变source snapshot。

5. Native加载fixture最初用Input.parse_input_event把局部viewport坐标再次按headless窗口缩放20倍，导致点到气泡外取消而非retry；日志证据BUBBLE POINTER (5270,14020)，预期(263.5,701)。与现有生产input测试统一改root.push_input(event,true)，且等待公共气泡进入hold后再点按钮。第5次独立user目录运行原生存档/损坏恢复/未来schema/真实取消/重试/暂停14项全过。GL真实窗口测试仍使用Input.parse_input_event。

6. GL01–04窄屏fixture错误把物理窗口size当App逻辑page size，360截图落在左上。改为与App同样的720逻辑宽、窗口stretch和PageHost居中。GL05已得到真实360×800、430×932、960×1280、1440×2560 PNG；其误断言使用ViewportTexture.get_width（带stretch的抽象值），修正为get_image的真实读回像素尺寸。旧宽度断言不作PASS证据，最终稳定源必须重跑修正fixture。
