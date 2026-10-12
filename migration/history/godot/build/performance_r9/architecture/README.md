# 依赖与状态流

App -> Home(组合根) -> 页面控制桥 -> 页面视图。
TravelService.changed -> PhotoCollection投影；SkinStore -> PhotoSkin只读绑定。
Home -> OverlayPort -> 当前owner持有的输入/渲染状态。页面之间不互查内部字段。

`test_overlay_port.gd` 参数为端口脚本绝对路径；`test_overlay_app.gd` 参数为动态包根、显式候选包或`none`。候选与正式不可混称。

该目录16+26项证据只覆盖架构与生命周期；帧时收益由独立统一性能基准记录。
