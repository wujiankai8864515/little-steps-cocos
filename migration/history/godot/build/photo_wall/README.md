# 照片墙单页工程

基线：56193b766b3c13d83ac5aee7149f4d8045e5733e。此分支仅实现用户已批准的照片墙；不实施收藏/百宝箱新工程。

## 产品入口与数据

Home `home_page.gd` 的 Photo1/Photo2 真实点击 → `photo/photo_bridge.gd` → `photo/photo_page.gd`。旧 HomeNote 大图/下一张弹窗已删除。没有详情页、收回确认或收藏箱。

`photo_state.gd`、`photo_store.gd`、`photo_collection.gd` 维护唯一 photo_id 和 photo1/photo2 → photo_id。首次迁移仅包含原Home两张既有照片；随后接旅行库存已收纳的 `id=photo` 奖励，以reward uid形成稳定ID。不从设计图的12张示例生成库存。

- 六个固定展示夹点，六张以内没有换批入口
- 两个可拖夹子独立绑定Home槽，丢空处/触摸取消不改绑定
- 30张墙容量，超过容量的原旅行库存不删除；稳定获得顺序保留墙上30张
- 叠摞层数为当前批未展示数，最多20层；切批不改绑定
- localStorage为Web权威存储；native校验和/备份/临时文件提升；旧或未来schema不覆盖

## 渲染与资源

新 `photo_visual` 仅有两张纹理，独立 `packs/photo.pck`，Home冷首屏不请求它。脚本属于core_code，构造/_init不读取未挂载新图。资源门槛不放宽：80 specs/batch、128 entries、256MiB估计。

`photo_config.gd` 集中布置、网格与尺寸；`photo_paper.gd` 使用每片8×10细分网格，顶部中点固定、下缘错相弯曲；shader采样实际照片内区，去旧照片烘焙夹子/边框，叠独立真实纸框与程序折痕/卷角法线。槽印记随photo_id进入每片material，不写入展示位。

与Home/暗室共享cycle_clock；无窗mask。日月光从画外移动，纸张每帧变形后的世界坐标进入同一条光场；夹子接触影、纸背影和角色接地影沿同一cast_dir。复用原XiaoyuRig与原瞳孔/闭眼片，只呼吸、眨眼、尾鳍轻动且视线固定向上。没有第二只烘焙角色。

退出/后台禁用整个页面动态子树、取消捕获；资源加载失败可重试或回Home，代际检查拦截取消后的迟到完成。页内提示与返回复用公共组件。

新图原始生成提示/来源/大小/hash/查看与确定性图集装配在 `design/photo_wall/`。Home最初两张照片保留已有256×320来源；墙面改用明确标注来源的480×512参考编辑内画，不声称找回原生高清像素。

## 验证

- `test_photo_state.gd`：ID、迁移、绑定、切批、重复同步、容量、stale、checksum、未来schema、保存失败通知
- `test_photo_native_load.gd`：真实native存档/损坏备份恢复、慢加载、真实viewport输入取消/失败重试、后台/关闭暂停
- `test_photo_ui.gd`：真实Home照片点击、鼠标拖绑、触摸取消、换批/回批、固定夹点/实际变形、晨昏夜GL、App相同逻辑尺寸与DPR2实际PNG读回

仅以稳定源最终重跑结果为准。此前失败/fixture错误在 `build/reviews/photo_wall_*` 记录；输入断言PASS不能掩盖日志中的SCRIPT ERROR。Mesa软件GL不等于手机GPU、触感、60fps、Web内存或用户美术认可。

正式顺序：逐项中文commit → root依序普通GitHub push并完整远端读回 → 同源正式PCK/Web → 冷/暖/失败/取消/重试实际包验证。预检不加--packs，不能拿诊断目录当最终产物。
