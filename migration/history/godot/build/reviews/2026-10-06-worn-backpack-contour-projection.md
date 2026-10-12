# 新穿戴背包缺少自身轮廓投影

触发与确证：1a6e366/d921f93的新五层包只有receiver。configure删除了旧整包Sprite caster；旧spring parts的影仅在hanging启用。原Home投影测试只检原角色的出发透明度，不覆盖新包轮廓，因此不能据此声称新包影已实现。

修复：复用已有home_grounded_shadow.gdshader及AlphaGrounding的浮空网格投射方式。五份ArrayMesh直接用实际拟合Polygon顶点、同一三角索引、原atlas归一化UV；每份mesh由自然光和灯两个pass共用。着色器真实取透明alpha，保留提手孔/带间隙；不是矩形影或另一幅整鱼。沿用Home ground_y、0.72高度因子、自然光方向/cot/窗光门控、月能量和灯光衰减规则。包悬在角色上，不伪造接地接触带。

所有权：投影节点归同一backpack子树，缓存5mesh/10pass/10material。仅floor变化重建缓存，普通sync不逐帧重建。最高拖拽Canvas或实际抬起时停止地面投影；卸包/隐藏/全局no_shadows关闭，重复穿戴复用。home_world在原actor opacity更新后同步包pose和投影，保证出发同调用跟随同一角色、同一alpha，不等下一帧。

实际GL反证与检查：自然白天新增6171px、黄昏4163px、月光9210px、仅灯645px可观察差值。关闭texture alpha、强制填满几何的测试对照与真实投影相差2273px，说明透明间隙未被填成几何块。拖拽、卸包、出发alpha=0和no_shadows与关闭新投影的图完全相同（0差值）；0.5透明时RGB差贡献376411，相比1.0时748838约减半。连续出发移动后投影仍有实际贡献，并在该调用内与原actor/包姿态同步。测试截图为实际Mesa软件GL，不是CPU拼图。

预算：没有新贴图/资源gate。120顶点、110三角，5份共享mesh的顶点/UV/颜色/索引payload为5160B；这不等于引擎对象或总CPU/GPU内存。额外保守预留256KiB给5ArrayMesh、10MeshInstance2D、10ShaderMaterial和相关缓存，绑定现有home_worn_bag_pixels资源spec，由resource_pipeline重复生成。与alpha补丁合计后该独立树128entries、250302392B；最终联合新场景仍须复核。未测实际浏览器GPU/进程总内存。

回归入口：build/approved_backpack/test_worn_projection.gd（真实GL像素/网格/缓存/灯光/中断/出发），test_alpha_hit.gd（56项），build/checks/test_round5_home_actor.gd（44项真实输入）。证据目录approved_backpack_shadow_qa/frozen_gl。没有改包图、UV或款式；用户新包材质目视认可和正式Web验证仍未完成。本提交不发布PCK/Web。
