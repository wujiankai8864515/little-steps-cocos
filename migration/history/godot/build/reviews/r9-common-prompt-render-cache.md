# R9 共用提示测字与空重绘

根因：PromptSparkles每帧测量未变化标签，且同一绘制中6枚闪光反复读取/求逆同一坐标变换。HomeWorld每帧queue_redraw，其覆盖_draw实际上为空。

修复：缓存标签实际文本/宽度/字体对象/字号的测量结果，并响应字体Resource.changed；theme解析得到的新字体/字号自动失效，换字体先断开旧信号。父变换、视口和逆矩阵只在每次draw读取一次，保持移动/缩放/旋转/屏边裁切实时；不缓存这些跨帧坐标。删掉Home空_draw的排队，原dust重绘及所有光/物理保留。

9项组件检查通过，1200次不变标签只测1次；文本、分数宽度、字号、替换字体、原字体资源changed、theme字体/字号均正确失效且边界与旧公式精确相等；viewport/parent改变不污染测字并保持逐draw坐标；销毁信号自动解除。

native Mesa GL补充：6种文本/theme/font/viewport/父变换配置（包括430×932）完整RGBA SHA与原版相同；6组Wardrobe共享HomeWorld/Prompt的固定昼夜/姿态画面同样像素完全相同。候选均无ERROR，保留材质/数量/alpha/动画/纹理，不以此宣称Web/手机性能。证据build/performance_r9/runtime/common/。
