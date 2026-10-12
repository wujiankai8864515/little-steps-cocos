# N23 收藏选择稳定性

根因：select_item调用整页_build，销毁底部控件，且_build_objects按选中index排除/重排藏品。每次点击都改变位置与节点。
实际修改：把详情放入StableDetailHost，选择只更新详情及选中高亮；底部按固定顺序建立，保节点/尺寸/旋转/热区。库存真实变化才重建。
验证：候选源码SHA e787acf31b9861117ae7087847f6771f38e457846837806dc3b58c7aa3381c9e 与当前实文件一致；官方4.5.2编译为候选core，八延迟PCK不变，empty res、zero overlay、真实Home入口打开收藏，真实鼠标连续选1/2/3/0/1，底部节点ID/pos/size/order不变且说明正确。证据在build/round7_collection/N23_*；实际查看after_selection.jpg图。不是正式发布/Web用户验收。
副作用：本次保留单项选择与日志入口；超过4项分页尚待N24，不将本组视为完整。N25详情底板仍缺，另行实修。跨页键盘行为将在N24一并核验。
