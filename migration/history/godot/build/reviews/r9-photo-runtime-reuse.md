# R9 照片运行复用候选

基线：6327bdb。没有修改图片、字体、shader 程序内容、网格密度、物理/动画公式、纸张或阴影数量。

根因：每次照片刷新为相同程序重新创建 Shader；每张纸各创建一枚相同 1×1 白纹理；同一帧为各 receiver/纸张/角色反复计算同一光场；墙面堆叠绘制通过 batch() 深拷贝完整照片集，只为了计数。

修复：最多 5 个不可变 Shader 缓存，各 ShaderMaterial 私有 uniform 保留；惰性唯一 RGBA 白纹理；页面每帧一次光场并显式传递给消费端，保留旧方法参数兼容；stack_layers 使用与旧分批等价的整数计数。均无新 pack 依赖。

验证：build/performance_r9/runtime/check_photo_reuse.gd 使用显式标记 source candidate overlay 和实际正式 PCK 资产，原 6327bdb 冻结脚本为公式 oracle。16 项通过：1441 昼夜采样光场和 uniform 完全一致；1086 纸张姿态的顶点、轮廓、四层投影、颜色、变换完全一致；775 分批计数一致；program 共享而 uniforms 独立；白纹理尺寸/像素一致；缓存不超过 5 项；页面/角色解析通过。证据在 build/performance_r9/runtime/photo/。这是组件候选，不是正式冷包、nativeGL 像素/Web 性能通过；整合运行与画面比较仍待执行。

夹具复盘：初次未隔离 HOME/XDG 导致 editor/cache 无写权限，PCK 虽写出但命令按错误拒绝。已将所有环境目录隔离在候选输出下重跑。其次候选 remap 使用别名目录，直接按依赖顶层解析时不能解析 source 依赖；现显式 overlay 将同路径原始 .gd 与指向自身的 .gd.remap 配套，避免隐藏预热顺序。顶层 page/actor 解析和全部测试重新通过，无错误。没有改系统权限或绕过文件限制。
