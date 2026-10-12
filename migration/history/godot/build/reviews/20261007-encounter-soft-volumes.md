# 奇遇光束候选：取消扫线与线条推进

用户最新范围：奇遇全屏柔光集中实际 hit，不强迫、不打断；与常态丁达尔分开。本项基于197ee6c并接179c8fd落叶独立提交，不改变shared_clock或light_snapshot。

根因：原 EncounterFlow 用三条 Bezier 轨道，每条24段 draw_line，包含5px高亮芯，三颗菱星沿每条轨道循环平移。线条/扫动来自这个绘制实现，并非昼夜时钟。

真实修复：移除全部线芯、移动轨道和沿轨道扫过的星点，改四个屏幕边缘到实际46px Button中心的宽体积光场。9列横向高斯软边×7行轴向平滑渐隐；仅低频4.8s呼吸、保留目标处原菱形贴图。节点MOUSE_FILTER_IGNORE，不改service、route、选择暂停或实际按钮。

验证：官方4.5.2原生Mesa GL，197ee6c正式PCK资源 + 明示的源文件组件候选；昼夜各0/1.2/2.4秒，实际查看日/夜帧，4束柔光汇聚、不再有5px线芯或沿线扫点。检查不拦输入、target与event的route_position一致。未跑真实输入选择/取消，不冒充正式新冷包或用户验收。图中站牌无字是组件fixture未挂Page标签，不是生产站牌改动。

复盘：初次误用历史N27 PCK，其SceneConfig缺sample_route_segment；第二次尝试源码PCK remap无法解析，均停止，不作为验证。改用明确源码镜像只替换preload路径避免旧config，再获落叶worker指明197ee6c正式PCK路径，最终验证只认encounter_evidence中的当前包固定hash结果。没有改生产时钟、依赖路径或删除保护。
