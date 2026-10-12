# Home 拖拽与喝水有限组：e394 正式包倒查

## 结论

范围仅 A003/A004/A005/A013/A021。没有改冻结源码，没有覆盖或追加 PCK，没有 push/deploy。

- A003：在本次静置日出06:00、日间10:00、黄昏18:00、夜间23:00及夜灯实际点击开/关的 GL 帧中，小余、娃娃、碗、凳子的 alpha 底沿与接触影相连；未发现新增确证缺陷。仅这些时点与既有资源画风的有限观察，不代表全天每一帧或用户视觉认可。
- A004：小余抬高180px时接触影从0.19变为0、投影保留，落地回0.19；未复现小余多余固定影。普通道具发现具体缺陷：碗、娃娃、凳子拖高35/90px仍只传入5px投影高度，接触影仍0.15416，投影和接触带跟着整个物体上移。碗及凳子的两高度实景明确可见；娃娃被箱体遮挡较多，数值同源。隐藏相应helper后这块影消失，排除该块影烘入源素材。不能称本项通过。
- A005：180px悬起时原actor仍跟住固定grab点，主体rotation恒0，观察到克制下垂及轻微上下变化，未见明显左右Q弹或脸鳍脱接。36个采样中肩位置x跨度1.10px、y跨度4.39px，尾位置x跨度0.70px、y跨度2.40px；这是轨迹辅证，不替代逐帧视觉或触感。容许母版原有轮廓/嘴形，不为追求夸张水滴另改风格。
- A013：真实碗拖到红嘴开始现有饮水，sip区24个采样最大rim/mouth锚误差0.00003052px，实际图中碗靠红嘴、瞳孔朝碗，有嘴部和闭眼变化，落碗回固定锚。恢复可敲击后真实触摸+仿真鼠标只结算一次功德。随后 natural_drink 专门补验默认ambient：只固定昼夜时刻，未写ambient开关，生产饮水自行暂停/恢复ambient；结束后的真实鼠标敲击一次、饮水中失焦取消恢复碗原transform和ambient，随后真实touch+仿真mouse仍只敲一次，16项0失败。
- A021：原actor/附属件置于临时Canvas，真实新建Home Canvas层90后临时层提升；鱼、碗、娃娃、凳子的四边及中央root鼠标拖放均受完整轮廓夹限且归固定锚。释放/触摸取消/失焦恢复父层与锚，resize保持当前拖动层与Home transform一致，再实际取消可归位。满包+未读日记、开包后浮动奖励均实际生产状态组合，鱼覆盖这些物件，拖过奖励未收纳。地图仅在离家显示，此时鱼不可见，不构造不可能组合。未对穿戴背包时拖鱼做覆盖，不能称附属穿戴全场景验收完成。

## 精确执行证据

冻结源码 commit: e394bda99cab432c27d351953c2d7ba2227d8384。
输入九包目录：/workspace/scratch/3f82ff2b3f81/darkroom_entry_formal_e394bda/native_packs。
官方 engine SHA256：5803746bbe055bee0f07a3c5b0dd347719bd45599f3d34519a8a0beaf83014ae。

四个有效运行均是空res根（只有project.godot）+正式index主包，实际App、注入native pack backend动态挂载，0 overlay、0物理生产源；使用App._commit_home跳过本组无关开场格漫，明确标注。隔离HOME/XDG，独立Xorg，结束关闭自身Xorg。各run summary都核九包与测试hash前后不变，engine运行前后固定。provenance.json另列9包和17个源码/资源入口对应的精确PCK成员hash。

- baseline_v2：45个运行断言，0失败；20张原始720×1280 GL帧，全部逐张查看；输入28个。
- edges_combo：150个运行断言，0失败；3张全图（含实际720×1558）、2张未缩放GL裁图，全部查看；输入73个。
- prop_shadow：10个动作前提断言，0失败；9张未缩放GL裁图，全部查看；输入15个。断言没有把投影外观写成已通过，缺陷来自生产数值与像素对照。
- natural_drink：16个正常ambient生命周期断言，0失败；没有额外图（视觉沿用同包baseline_v2实际饮水图），保留精确包独立运行日志与输入记录。

全部使用Mesa llvmpipe软件GL。没有验证用户硬件GPU、浏览器/Web、手机手感、声音、Web内存或60fps。运行断言数量不是视觉验收数。

## A004 原始对照

prop_shadow/bowl_up35.png → bowl_up90.png：碗底支持点从y971.1191变为916.1191，接触点从976.1191变为921.1191；高度永远5，接触alpha永远0.1541632373。

prop_shadow/low_table_up35.png → low_table_up90.png：支持点y1176.183变为1121.183，接触点y1181.183变为1126.183；同样高度5、alpha0.15416。图中原阴影形状随整个凳子上移，无法表达变大的离地高度。

每个up35/up90均用root鼠标实际拖动，生产world、grounding正常更新5帧才取图。共享时钟固定10:00，ambient关闭用于不让无关动作干扰。只有后续*_helper_hidden诊断帧暂停world更新并隐藏目标helper，保持同光照和同物体位置；该帧不作为正常生产表现。没有通过关闭world制造前两帧旧shadow。

确证定位：games/travel_woodfish/project/home/interaction/home_interaction_controller.gd：普通prop的pointer_move/update传固定5.0，_set_anchor把interaction_lift_height设成5并把caster ground挪至当前anchor；_begin_settle对非鱼也固定5。当前grounding收到的高度数据无法表达实际上举量。修改前需分配新候选树。

## 首次无效夹具记录

baseline_720被runner190秒超时终止，没有保存图，不能计为视觉证据。其全屏alpha扫描过重；review冻结/ambient关闭未解除导致两项敲击断言无效，resize断言误要求必然取消。check_v2改为准确alpha邻近点、真实敲击前恢复时钟、允许安全继续drag后再真实取消。harness_review.json保留说明；未改生产来迎合夹具。
