# 秋叶寺院场景分层原画

本提交只交可复用原画、坐标及资产检查，不表示 26–32 的运行时动态已经完成。基线为 `2a123d9c050ce0c5d9889ffada7ab3ae24b7957f`。未修改 travel_page、公共组件、运行配置或资源准入上限；没有部署或推送。

## 实际产物

- 原路径 `project/travel/assets/travel_map_plate_v5.png`：941×1672，2,486,315 bytes。保留地图/河/桥/寺/山门、道路及UI布局；强烈金色侧光、柱上叶影、石阶硬高光变为柔和环境照明，保石材/木材/青铜的体积与纸绘色彩。前景钟移走，3片屋檐银杏扇叶局部补屋瓦/木梁，原中距离浮叶去除。后续光照仍应保留环境明暗，不能把底图打成纯平色。
- `project/travel/assets/travel_scene_layers_v1.png`：512×512 RGBA，153,131 bytes，13个不相交区域。钟体、钟舌、原像素悬链、前柱与石栏遮挡、3片原画屋檐扇叶、1片原画中距离浮叶、3片落叶复用、2条水彩云。
- `scene_layer_regions.json`：每片 region/position/size/pivot/z，720×1280局部坐标，含钟体/钟舌的相对锚点。这里只是资产坐标契约草案，实际运行配置由 runtime worker 接入。
- `source/`：原基线地图、4张内置 imagegen 原始输出、参考裁切、遮罩。全部在 design，不应放进 PCK。
- `evidence/`：完整静止分层复合、原图/改图局部对照、棋盘透明atlas、夸张两端姿态素材检查、官方导入回读。姿态比较是独立素材的静态设计检查，不是游戏动画验收。

## 保真与来源

先实际查看基线完整地图、独立批准角色及批准母版，再调用内置 imagegen；4次生成提示完整保存于 `generation_prompts.json`。

中性底图由原地图编辑得到，没有换场景或新增地标。原图标题、返回牌、气泡、下方角色/背包、底部纸牌及地图木牌通过遮罩直接复合原像素；6个保护区总计282,837个采样像素的 changed_pixels=0、max_channel_delta=0，见 `asset_audit.json`。独立 `travel_map_actor_v5.png` 全文件不变。保护区之外保留生成的中性环境光。

钟体从原图可见青铜钟的形制、铸带、材质、开放下口和原悬挂位置重建；原图左半被柱遮住，原始隐藏像素不存在，因此这里清楚标注为 imagegen 补全，不声称是未遮挡原像素。钟舌由同一参考分离补全。实际显示重新置于原柱及石栏后。悬链、柱/栏遮挡直接取原图/中性图像素。

屋檐叶片RGB直接来自中性原画，手工沿实际轮廓制作alpha，并去除边缘少量屋瓦色泄漏；没有以几何叶片代替原画。清理静态对应叶片的生成结果只通过小范围遮罩复合，避免整图重生成漂移。中距离叶片直接来自原图山门旁浮叶。云为原有云画风参考生成的透明薄雾条，推荐alpha 0.28–0.50，原画远处固定云群仍保留纵深。

## 导入、预算与验证

地图显示720×1280，原尺寸941×1672保持，避免标题/角色重采样。地图RGBA8为6,293,408 bytes，含64KiB预留6,358,944；与原图解码预算相同。Atlas512² base RGBA8为1,048,576 bytes，当前不带mips，含预留1,114,112；若正式接入选择mips，总RGBA8为1,398,100，含预留1,463,636。新增纹理只有1个entry；必须由集成者淘汰确认无引用旧资源再做128entry联合准入，不能提高门槛。

Atlas各个显示尺寸见JSON。钟体142×242 texels对应86.46×147.75画布单位；云300×65对应192.82×42.87，叶片约74–85px对应52–67单位。常见390px宽页面下，原画和atlas覆盖DPR2接近或高于实际需求；720宽DPR2不是全纹理原生2×，不宣称无限高清。

已用固定官方 Godot 4.5.2 引擎 SHA256 `5803746bbe055bee0f07a3c5b0dd347719bd45599f3d34519a8a0beaf83014ae` 在独立导入工程 lossless 导入两张PNG，关闭fix_alpha_border/premult_alpha/size_limit，逐字节比较回读RGBA8全部相同，见 `evidence/official_import_audit.json`。这不替代最终同源PCK、动态挂载、昼夜/风/钟声、设备GPU、浏览器内存的联合验证。

独立初次导入因未配置可写XDG数据目录报错，之后改成QA目录隔离并两步均exit0。复盘见 `build/reviews/2026-10-06_场景资产独立导入目录复盘.md`。

## 离线复现

在仓库根执行：

```sh
python3 games/travel_woodfish/design/travel_scene_layers/prepare_masks.py
python3 games/travel_woodfish/design/travel_scene_layers/build_layers.py
python3 games/travel_woodfish/design/travel_scene_layers/verify_layers.py
```

依赖Pillow与numpy。不用再次调用生成器；保存的生成原件是固定输入。脚本可确定性重建PNG/区域/保护区检查/设计对照，不执行运行接入、构建、部署。
