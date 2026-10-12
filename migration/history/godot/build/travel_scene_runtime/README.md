# 秋叶寺院场景候选：固定路线、分层风景与共享光照

基线 `2a123d9c050ce0c5d9889ffada7ab3ae24b7957f`。本候选只覆盖第24、26–32的具体实现与组件证据，未包含第25包款、没有正式PCK/Web发布，也不代表用户接受32项视觉结果。

## 剧情兼容

`travel_content.json`、`travel_model.gd`、`travel_store.gd`、存档schema和原剧情文字不变。原随机地点继续用于奇遇、日记与收藏来源；地图永久名称来自 `travel_scene_config.gd`，主提示仅显示固定本地节点。次级说明明确写“故事背景：原地点”，不把寺院牌反复改成不同城市。

现画面是一个寺院山谷场景，10段路线从左上山门沿原画浅色道路，经林间小径、溪畔弯道、石桥岔路、临水坡、寺前小径、秋叶寺、山路、枫林、云边坡，最后转入画面右下归途山门。石桥和溪边另有永久地标牌；石桥岔路是主路路口，不冒称穿过桥。每段弧长插值，阶段端点就是固定节点；没有随机刷新地图坐标。模型仍为100有效秒、10阶段、同趟2–3个确定性奇遇、选择时暂停、取消恢复、末尾自动结算。旧存档无需迁移即可显示。

## 配置接口

一个 `travel_scene_config.gd` 集中配置底图路径、atlas region、图层坐标/尺寸/pivot、风与叶弹簧、云速、钟体/钟舌弹性与接触阈值、原创声分音/衰减/音量、日光路径/光束/阴影锚点、11节点/10段折线和固定地标。

通用页支持 `configure_scene(dictionary)`；通用runtime只读传入配置。新场景提供同结构字典、资源及资源组声明即可，不需要管理后台或逐场景改通用绘制代码。当前仅接入获准秋叶寺院一景。

## 动画、声音、时钟

底图从不平移/转动。4枚实际叶片有不同相位弹簧和惯性，18枚小落叶循环穿行，两层薄云以1.55/-2.05逻辑像素每秒移动。钟体和钟舌独立弹性角，内部悬点随钟体移动，舌部保持独立惯性；相对角到阈值时碰撞反弹并发出同帧触发。首阵风约3.5秒，后续14.7秒间隔，碰撞声最短间隔8秒、最多一声部，不叠播。

声源是原创加法合成单声道PCM16，不下载、不另增运行文件。实际参数22050Hz/2.8s，PCM 123480 bytes；硬上限24000Hz/3s，最大144000 bytes。资源契约额外保留600000 bytes，覆盖三份最大PCM及128KiB瞬时/播放缓冲余量（563072 bytes向上取整），不是Web堆实测。这600000 bytes绑定到atlas的准入estimate，实际App资源gate会一并保留，非只写离线报表。现有音乐开关、已有手势解锁状态、Master静音和音量全部沿用。后台/选择暂停/页面退出立刻停钟声；退出释放stream、atlas引用、叶状态和节点。无新异步加载、Timer、粒子节点或Tween。

App、Home、Travel共享同一 `home_cycle_clock.gd` 对象。runtime不调用advance/tick。日光沿天空变化，月亮/星点夜间出现；可见体积光束有横向软边和纵向衰减，地标与actor阴影使用同一太阳方向。整体色温只作环境光的一部分。

## 资源及验证

资源层来源、原始分层素材和官方无损RGBA回读见 `games/travel_woodfish/design/travel_scene_layers/`。仅中性底图替换原同路径和一张512² atlas进入runtime。三个旧HUD纹理 `button_icon_circle/counter_merit/icon_settings` 已查生产GD/TSCN/TRES零引用，移出当前资源组与实际导出sidecar/ctex；原恢复库存仍保留。`merit_box`仍被HomeWorld使用，保留。

本候选合约：126 entries / 242848640 bytes估计（含600000声音保留），各批<=80、总预算<=256MiB。Home不依赖travel_visual；新图仅在打开地图挂载完成后加载。Home首屏19MB还需集成者从最终同源包重新核对。

可复现脚本：
- `build/checks/test_configured_travel_scene.gd`：路段连续/永久名牌、原状态不改、选择暂停与取消、碰撞播放、静音/零音量/手势/后台、昼夜方向、退出释放/重进。
- `build/checks/test_travel_scene_clock.gd`：实际App._process与Home/bridge组件的3600个1/60s tick，同对象ID、逐帧hour、60s循环、后台、恢复首帧和返回Home。
- `build/checks/record_travel_scene_motion.gd`：GL画面帧和碰撞时间；路线5×只用于短片，风/云/钟1×。

证据边界：原生Mesa llvmpipe是真GL软件渲染；非硬件GPU、手机、Web动态挂载或浏览器内存PASS。Dummy驱动验证触发、stream和波形；视频审阅声轨可使用源WAV按真实碰撞时刻混合，但没有物理扬声器采音或人耳听感验收。
