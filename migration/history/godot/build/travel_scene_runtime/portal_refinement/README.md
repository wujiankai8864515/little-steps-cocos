# 树隙光束与地图小余受光细化

在已提交场景候选9b104d4上，仅修改SceneConfig/SceneRuntime/Page三文件。无新增资源文件、Shader、资源entry或准入上限。

- `beam_portals`集中配置两处树隙 `(249,287)/(332,324)`、寺檐 `(501,404)`、前景檐口 `(161,690)`；每个源含长度、起止半宽、强度、错相参数。源点固定在原画实际枝叶/檐口，不再跟随太阳索引偏移。
- 所有轴沿同一太阳方向，横向软边用其垂直向量。横纵顶点alpha渐变；按10个受保护矩形裁切并在交点插值颜色，不覆盖标题、原气泡、当前说明和固定木牌。
- 地图移动小余的Control.modulate每帧及refresh初建时继承scene.light.tint。场景中的大原角色与移动小余夜里都偏蓝暗；公共气泡、地图提示文字与待处理菱光保持原独立可读层。

同一冻结画面仅切换beams_enabled，官方Godot4.5.2/Mesa llvmpipe真GL像素对照：早5.5时16288、午12时15986、昏18时11957像素改变；最大单通道变化49/45/52。夜23时改变0。四时刻10处受保护区域最大差值均0。法向与轴点积均0；小余四时刻modulate均与scene tint完全一致。PNG的贡献图是实际on-off差值放大6倍，非alpha或shader声明。已实际查看早午昏夜on图、午贡献图和夜间待选奇遇图，文字/菱光可读。

复现：`test_travel_scene_portals.gd`生成相同帧on/off与scene_portals.json；`python3 build/checks/check_travel_scene_portal_pixels.py <输出目录>`做像素断言。

## cold-core首次IO审查

- SceneConfig只有常量路径字符串、Rect2/Vector2/Color及字典；无load/FileAccess/JSON读取。
- SceneRuntime的静态preload只读SceneConfig脚本；成员初始化为空容器、数值和nullable引用。不存在_init IO。load底图/atlas与原创PCM生成只在显式configure中发生。
- Page静态preload只读脚本；scene_definition默认指向纯值字典。route_position仅对配置数组计算。Page.configure与bind_scene_context仅清理旧节点、保存服务/clock/music引用，不load旅行资源。
- 首次素材读取仍在Page.open → _load_page_assets，随后refresh → _ensure_scene → Runtime.configure。生产bridge只有旅行group真实挂载成功后才open。
- 这份源码审查不替代core-only实际mount；父级整合树负责该专项。这里没有重新全build或发布PCK/Web；字体corpus metadata请由整合树统一刷新。
