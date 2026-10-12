# R9 衣柜有界粒子与隐藏物理候选

基线6327bdb。每次试穿/装备22枚Sprite2D和AtlasTexture被创建后销毁；当前场景仅两种区域、固定最大22枚。改为首次使用惰性创建22节点及2纹理区域，后续复用并完整重置rotation/modulate/position/scale/time/phase。数量、轨迹、透明度、寿命、延迟、纹理不改。关闭仅隐藏池，随所属页面销毁统一释放。

衣柜复用完整Home actor世界，仅隐藏房间图。原Home IndependentRoomPlants隐藏后仍运行弹簧/投影；对这一永久隐藏子树设PROCESS_MODE_DISABLED，角色、骨骼、眼睛、拍击、拖拽、衣布/藤蔓弹簧、共享光照全部保留。

32项组件检查通过：20轮84,480个逐粒子状态与冻结原版完全一致，节点身份跨轮稳定且池22/纹理2；清除/关闭全隐藏；8轮试穿取消保同rig/mesh与原存档。无引擎错误或ObjectDB泄漏。6组实际Mesa llvmpipe原生720×1280光照/相位画面，包括效果状态，完整RGBA SHA全部与原版相同，画面已实际查看；native日志无ERROR。证据 build/performance_r9/runtime/wardrobe/。无图片/字体/材质/动画/物理公式变化。未据此宣称Web、触感或稳态帧率通过。
