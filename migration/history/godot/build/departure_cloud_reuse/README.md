# 确认出发净化云专项候选

不是 N27。两处生产修改：home_departure_visual.gd 与 home_page.gd。复盘/资源集成和未验边界见 ../reviews/2026-10-07-departure-purification-cloud.md。

复现：run_gl.py --engine 官方4.5.2绝对路径 --packs 既有native_packs目录 --output 新空目录 --pack-label candidate-component-only --check-script 本目录/check.gd --source 源工程/home/home_departure_visual.gd。

基线用 git show 197ee6c:games/travel_woodfish/project/home/home_departure_visual.gd 导出到文件名含 baseline 的文件；相同 runner/check 与 PCK、只换 --source。baseline 模式适配旧 configure 三参数，不假造当前实现。

这显式使用源码覆盖视觉组件和历史 PCK 的环境/资源，不能当成新候选冷包入口已通过。evidence 中包含5张关键原帧、7阶段/侧对照、前后同阶段对照、运行命令、引擎与每个PCK固定hash、运行日志和状态；图片 WebP 是原始 PNG 无损转码。
