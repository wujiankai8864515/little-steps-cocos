# N01 字体资源闭环

前次对象文案代码修复后逐字cmap审计发现bootstrap等基线四子集均缺“图”，故地图文案会有缺字。此项不是仅补清单：用项目原固定OFL源、原prepare_fonts.py/fontTools4.61.1，对7ba4243完整源码+本加载候选替换构成的语料重建四字体（736 codepoints），真实资源diff入库。源字体/许可/字形度量比对沿用固定构建器并通过；来源及每文件hash见N01_font_coverage.json。独立cmap检查先红（图）后绿。

bootstrap由官方4.5.2 editor导入fontdata，加入原12文件delta共14文件；正式PCK+候选字体实际Mesa渲染地图加载中，已查看map_font.png，无缺字；32项GL测试通过。N02旧31项冻结结果保留，新32项单独N01_font_runtime.json/log。字体替换未改变既有字形/布局，三点稳定测试同跑通过。无正式包、发布或Web验收声称。

整合其它关联组后仍须对完整最终语料再次prepare_fonts并官方导入，候选字体不能替代全合并语料检查。本次原工具prepare_fonts.py只读；稀疏树通过/tmp虚拟只读链接语料避免复制资源，输出仅当前工作树四字体。可复现脚本prepare_candidate_fonts.py明确环境路径。
