# 新透明背包材质的 alpha 命中缺口

影响提交：1a6e366e2dc43aad2d00cda6474e82ae6db69ec2，仅独立第二阶段候选。原先将完整贴图作为五层Polygon2D显示，却沿用旧不透明小裁片的几何命中；三角内的透明提手孔和26px边界留白被当成包，可能抢走无关输入。不是绘图或UV问题。

确证复现：原生SceneTree在穿包、最高层拖拽、拖拽恢复、再次穿包四种状态，对提手孔(625,230)、留白(20,920)做实际几何→世界定位，各有两个错误命中。对照原实现9项失败（8次透明误命中及缺离线mask），45项通过。

修复：离线从当前1254×1254 PNG生成0.16阈值BitMap，嵌入已存在backpack_parts.res的metadata；原1024×1024悬挂mask逐位SHA保持不变。Home ready后configure只读取这个已有资源，无新增资源gate，也不提前读PNG或在点击时get_image。用实际拟合Polygon的三角形重心坐标还原原atlas UV，再查新mask；不改geometry、UV、材质或图像。穿包metadata同时去掉旧mother-plate exact声明。

防回归：test_alpha_hit.gd覆盖透明孔/留白负例、包皮与弧带正例、变形UV、穿卸/拖拽/恢复、旧悬挂mask和目标、invalid输入、重复点击无texture readback。修后56项通过，readback增量0；原Home真实鼠标/触控事件44项通过。prepare_alpha_mask.gd重复运行生成相同文件SHA，mask资源从5809B增到16016B；解码准入由196608B到409600B（+212992B），条目数仍128。

新包轮廓投影是独立已确证缺口：approved五层仅有receiver，没有新alpha对应的caster/grounding。先前projection测试仅证明原角色投影的出发透明度同步，不能充当新包轮廓影证据。本小提交不声称该投影问题已解决；后续独立提交必须做昼夜/灯光/拖起/卸包的真实轮廓检查。

此处输入回归不替代用户材质/背法目视认可、真实设备或Web验收。没有发布正式PCK/Web。
