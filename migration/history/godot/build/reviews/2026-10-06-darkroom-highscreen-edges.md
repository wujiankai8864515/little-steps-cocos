# B27暗室高屏倒查：真实墙板/地板扩边

状态：独立源码修复及测试候选完成，属于下一关联组；没有并入当前H01–11＋照片冻结，没有push、部署或Mac改动。

## 根因与修复

旧背景941×1672被映射为720×1280；`room_bleed.gd` 把上/下18行直接拉伸填充额外高度。720×1558画布每侧多139像素，拼接处可见截断、纵向条纹；1800更明显。房间中央构图本身不需要重画。

实看回收原图后，用内置image_gen分别扩画上部木墙、下部木地板，保持原材质、木纹和板缝透视。原图中央RGBA不变，原透明窗洞不变。新边缘各941×139追加到原图后，同一资源成为941×1950 atlas；背景Sprite通过region取原941×1672，继续用原缩放/坐标。RoomBleed从新条带靠近原图的接缝开始揭开，不再拉18像素或镜像地板。只有新边缘8行做RGBA接缝差值校正，无邻域模糊，未改中央像素。

沿用同一个room_light材质，没有新shader、材质、结点、纹理副本、资源路径或门槛调整。Home/App/Travel/Photo生产代码和源manifest均未修改。

## 预算与包

| 项 | 原值 | 候选值 | 增量 |
| --- | ---: | ---: | ---: |
| 背景RGBA8＋既有64KiB预留 | 6,358,944 B | 7,405,336 B | 1,046,392 B |
| darkroom.pck 文件数 | 38 | 38 | 0 |
| darkroom.pck bytes | 4,534,208 B | 4,782,656 B | 248,448 B |
| 按父任务给定关联组预算推算 | 267,297,812 B | 268,344,204 B | 1,046,392 B |

128 entries不增加，268,435,456 B硬限额剩91,252 B。没有新增shader资源预留，原资源64KiB保留；当前已有SubViewport随屏幕高度变化，修复未增加该缓冲或结点数。无mip新增成本。

最后一行是基于父任务给定当前关联组的精确增量推算，不能替代下一组真实App的全联合准入。下一组如果源预算变化，必须重算并拒绝超限，不得扩阈值。

本地 `build_candidate.py` 只生成TEST-ONLY候选：官方引擎导入新atlas、编译两份变动脚本，重打index/darkroom，其他包仅链接精确561原包。没有运行时覆盖包，没有物理源码资源兜底。正式关联组、下载/解码和远端仍由主任务统一重测。

## 实测与实看

- 原图中央941×1672的RGBA SHA256：`ca531ec0b8613ad27eda14617ce45272cc7369e22d25ba2e42dac3c7dbdb447a`，保存源图、生成atlas、官方导入回读完全相同；整张新atlas回读也逐RGBA相等。[导入审计](../darkroom_edges/evidence/imported_rgba_audit.json)
- 精确旧包与测试候选，分别从空res跑720×1280、720×1558、720×1800 × 日间/夜间关灯/夜间开灯。冻结无关返回牌与植物摆动，仅为可重现像素对照。九组中央720×1280实渲染对照全部0差异，包括标准屏整张画面。[像素对照](../darkroom_edges/evidence/central_render_comparison.json)
- 每个尺寸实际root.push_input针击中后，只减10、contact_count只加1。组件矩阵两侧各23项通过，无资源或脚本错误。图像验证与行为断言分开记录。[候选组件结果](../darkroom_edges/evidence/after/results.json)
- 候选生产App从娃娃邀请、确认、first-draw进入暗室，完整两针四拖鞋清零、2.85s消散/1s空档/1.55s重生、新娃再击及返回Home共63项通过。[完整轮次](../darkroom_edges/evidence/full_round/results.json)
- 该App候选仍继承561旧Home日记缺travel_brush.ttf，严格runner保持失败，未忽略；暗室完整行为通过不等于整站冷包通过。[App原始日志](../darkroom_edges/evidence/full_round/render.log)

实际看过1558日间、1800日间/夜间开灯原始截图、九宫格矩阵及全分辨率接缝对照。新增墙板/地板内容填满边缘，旧18px拉伸条纹和板缝断口消除，中央娃娃/工具/返回位置未位移；边缘随昼夜/灯光共用原材质响应。

- [九组实渲染画面](../darkroom_edges/evidence/matrix_review.jpg)
- [1558上下接缝修复前后原尺寸裁片](../darkroom_edges/evidence/seams_before_after.jpg)

这是一项边缘专项验证，不宣称暗室全部历史视觉要求通过；超过1800逻辑高度、手机高DPR触感/画质、硬件GPU、Web下载与内存仍未测。

## 可重跑

1. `python3 build/darkroom_edges/prepare_room_edges.py`：仅从固定authoring输入重建同路径atlas，核中央和两条接缝原始RGBA。
2. `python3 build/darkroom_edges/build_candidate.py --engine ENGINE --packs FROZEN_NATIVE_PACKS --output NEW_CANDIDATE_DIR`：仅离线测试候选，正式生产仍走build/PRODUCTION.md。
3. `python3 build/checks/run_cold_darkroom_round.py --engine ENGINE --packs INPUT_NATIVE_PACKS --output NEW_EVIDENCE_DIR --pack-label EXACT_ID --check-script build/darkroom_edges/test_room_edges.gd`：空res三尺寸昼夜矩阵。
4. 同runner不传`--check-script`，加 `--size 720x1558`：生产App完整一轮。

`raw_frames.json`固定原始PNG路径、尺寸、bytes与SHA256。最终组件目录 `/tmp/darkroom_edges_matrix_old_final2`、`/tmp/darkroom_edges_matrix_new_final`，App轮次 `/tmp/darkroom_edges_full_round`，候选包 `/tmp/darkroom_edges_candidate2/native_packs`。正式组应从新冻结源独立构建并重跑；不得把此测试patch包称为正式交付。

## 失败与防回归

- 首版整房扩图虽有新边缘，但透视不能精确拼回原图，弃用，改为对原上下边界分别扩画。固定素材/提示词保存在design/darkroom_highscreen，中央不采用生成图。
- 初始独立提图未隔离XDG数据目录，出现不可写目录和崩溃；隔离XDG后官方引擎成功读取。后续工具均独立XDG。
- 初版编译夹具同时带旧.gdc和新.gd，export形成重复包条目，read_pack校验立即拒绝。现在在编译前删除对应旧.gdc/.remap，最终官方导入/编译日志无ERROR。
- 第一轮标准屏图差异来自返回牌/植物在两进程不同时间摆动；冻结这两项无关动效后九组中央差异全为0，产品动效未改。
- 并行Xorg原先用PID选display，独立进程命名空间可复用PID导致display932冲突；runner改用随机未占用display，不删除别人的锁、不停止别人的服务。最终旧/新矩阵均完整成功。

## c242 基线整合实核

已在独立后续树基于 c242391826a723a6ac15024fce4dce0335cf40fc 合入，重跑实际 resource_pipeline 准入计算，结果为 128 entries / 268,344,204 bytes，余量 91,252 bytes；同步更新同路径背景估值至 7,405,336 bytes，不改变硬门槛。该结果是源契约声明，不是 Web 内存实测。Home 资源闭包未变；后续正式包仍需同源重核 19MB 与真实冷加载。记录见 build/darkroom_edges/combined_admission_c242.json。
