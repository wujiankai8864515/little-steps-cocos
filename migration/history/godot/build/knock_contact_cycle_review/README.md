# Home 敲击链：d1bfcaa 正式九包限定核查

结论：本次未发现需要修改生产源码的红项。源码 d1bfcaa0bb4ddf2f9980e27e7fabd3b22d8b8b0c 保持干净；没有提交、push、重包或部署。以下只成立于指定正式 PCK 的原生核查，不替代 Web、手机、用户 GPU、真实听音或用户视觉认可。

## 输入与资源身份

- 只读源：/workspace/scratch/3f82ff2b3f81/godot_home_grounding_followup
- 真包：/workspace/scratch/3f82ff2b3f81/home_grounding_formal_d1bfcaa/native_packs
- 引擎：官方 Godot 4.5.2，SHA256 5803746bbe055bee0f07a3c5b0dd347719bd45599f3d34519a8a0beaf83014ae
- index.pck：fc615b36f0ba81e52801cd35188334eebd8deaf2f0343e4b3a8af9f29fa459e1
- house.pck：9776b3279f07fef39e9b9532bba14fba1383ba43fc9190a495b90e77ce61952f
- 九包完整 bytes/SHA256 在 gl_v1/summary.json；每次 GL runner 前后核包及引擎 hash。source_resource_provenance.json 另从实际 PCK 重读22个相关成员，核MD5、SHA256、manifest归属及资源映射；没有提取生产树或overlay。
- 所有运行 res 根只含 project.godot；主包由 --main-pack 加载。真实 App/native pack backend 冷挂 core、entry、comic、exterior、house。未挂 travel、departure、photo、darkroom。只通过现有 _commit_home 略过无关格漫；未直接实例化全资源 Home。
- 明示夹具：游戏时段10点、场景之间较长rest隔离自主击、金额provider=1/2/10/100；播放链、真实alpha输入及资源保持生产实现。

## 逐项证据与边界

### A007 原单次曲线/时长，只缩短idle

最新版 Sentinel_8a392f2b78f08191a9fe5e1d9e2e1d84 覆盖旧“动作加快”要求。home_world.gd 的 TAP_HIT=1.29、TAP_LENGTH=3.2、TAP_MOTION_END=2.15；_advance_ambient 直接采原clip，自动周期为完整运动+独立idle。ambient_director.gd 默认tempo=1.08、idle=.28、玩家恢复延迟=.8各自独立。xiaoyu_rig.tscn SHA与既有原曲线审计一致（ef0effe5c2ce9e734fc46f957a4d57e8c35e1f0aed6b1cf9bda41cee5d2747ad）；实际导出rig在house包，脚本在core。

headless_v3 是精确真包真实墙钟：四击contact 1214–1226ms、完整手动clip 2981–2993ms（原1.08速度）；每帧非contact直接采对应clip。自动运动1998ms+idle283ms=2281ms；只把idle改650ms后运动1999ms、周期2649ms，增加368ms。主曲线没有加速。

gl_v1 全720×1280：首击contact1656ms、完整3411ms，首段实际软件渲染停顿保留；后续contact1260–1321ms、完整3066–3077ms。不能声称真实设备时序/流畅度通过。原速动画逐帧片段是独立fixed30模拟证据，与这些墙钟记录分开。

### A008 轻受击与每击小变化

合并保留 B26-8 与 B26-9，不只检查闭眼。home_world.gd 同一contact帧设 _hit_reaction_age=0，嘴参数−1.15px、短暂闭眼，.15秒后退出反应。gl_v1/01_precontact.png、02_contact.png、03_reaction_release.png、04_impact_cleared.png 已看：闭眼很短，嘴轻绷，随后恢复；没有增加夸张痛苦姿态。

natural_v1 另跑三个真实时钟、自然连续周期，中间不重置completed_taps。contact的 strength 为1/.975/1.035；tempo为1.08/1.1502/1.0422；grip角为 .00925872/.00898275/.00963054 rad；三帧姿态时间均1.29，肩位均(130.0912,−82.19748)，功德/音效各递增一次。三个同相位原生帧已看：木槌接触位置一致，变化很轻微，不能夸称这个接触相位有明显肉眼角度变化。自然性最终仍待用户认可。

源码五档STRENGTH=[1,.975,1.035,.985,1.015]与TEMPO=[1,1.065,.965,1.035,.985]，通过completed_taps依次选取；grip附加角为(strength−1)×.42×anticipate。没有恢复已被覆盖的快速压缩曲线。

### A050 薄金微芒＋N

merit_amount_art.gd._ready在挂载后加载两图集；_award_mallet_hit→reward_label.set_amount→_layout，实际_draw逐字绘制。原＋1复合字与“功德”“＋”来自res://assets/merit_reward_14.png；其它数字来自res://home/feedback/assets/merit_digits_thin_gold.png。两图的实际import与ctex都在house；后者1983×945官方无损导入，RGBA/hash核验在source_resource_provenance.json。

四次均经root真实敲击触发，而非直接设置展示字。amount_001/002/010/100.png已看，文字可辨、薄金纹理保留。每字绘制宽高比等于图集裁区；1/2/10比例1，100整体同比缩至.820972，宽174px。金额2/10/100由明确测试provider输入；不意味着自然玩法当前会产生所有这些数值。

### A052 alpha命中、空白隔离、立即重播与一次结算

生产链：home_page._input→_world_pointer→_begin_world_press→interaction.pointer_down/up→world.request_player_tap→_advance_ambient contact。所有玩家击来自root.push_input；未直接调用actor触发击打。

gl_v1候选点扫描记录在results.json.candidate_points，同时核设置、灯、香、照片、旅行/收藏路由与interaction alpha。选定空白(12,400)和鱼可见AABB内透明点(82,808)无任何目标；点击无strike。鱼点即时serial+1、_tap_time=0，松开时未预先结算。6次55ms连点都重启，仅最后完整一击有功德/音效；触摸+模拟鼠标只记一次；失焦取消无迟到结算。金额四击也各一次。当前限定未覆盖所有页面/出发/长按组合，不能用旧专项全量结果外推本包。

### A067 接触三条手绘线的迸发/伸缩/消散

home_world contact→emit_action_mark→action_marks的tap专用三方向、多边形笔锋分支；无额外贴图/字体依赖，脚本在core。真实GL同帧生成一个tap，初始age0、alpha.94、scale.58；位于槌侧边，细金/赭色三线很小。

慢帧会跳过35ms扩张峰，因此单独补 phases_v1 固定30fps模拟GL，而非改变生产速度。已实际查看phase_00至phase_07：33ms时scale1.13779/outward5.714，随后回缩；100ms scale.87308/alpha.61895；166ms alpha.06257；200ms清空。三笔有伸缩与外迸，后完全消失。contact_1x_simulation.mp4 为2.5秒、500×430、30fps的源帧编码；录制实际耗时5668ms，既非实时性能也无听音证明。

## 检查与已查看素材

- headless_v3：81个有限运行断言0失败，真实墙钟，root input与一次结算，逐帧JSON；不是视觉证据。
- gl_v1：73个有限运行断言0失败；9张原生帧已逐张查看；真实墙钟数据未被放宽成设备通过。
- phases_v1：4项视觉捕获结构检查；8张接触33ms间隔局部帧已逐张查看；短片有ffprobe结构验证。
- natural_v1：11项有限检查0失败；3张自然连续击同相位帧已逐张查看。
- 共20张实际查看图登记在visual_review.json。数量不是美术验收数。
- 音效spy逐次转发至真实audio_port.play_effect(wood_knock.wav,−8dB)，记录调用帧、已加功德与原contact姿态；Dummy不能证明听到什么。

## 夹具失败保留与修正

headless_v1/v2保留原日志、结果和原脚本，不改成绿。确证原因是夹具把SubViewport的渲染倍数当成root输入缩放；鱼点被送到y1395。v2排除overlay后仍复现。v3以生产_world_pointer精确逆变换生成root坐标，并核逆映射仍是真alpha鱼，后通过。首次对其它入口的怀疑未被证实，不作为产品缺陷。当前GL同样使用此正确坐标路径。

另修正两个派生夹具的通用报告标题：fixed30原始结果误继承fixed_fps:false，原始文件保存在phases_v1/results_raw_header.json，command.json和phase_capture.json始终明确为fixed30；results.json现已据命令更正并留下metadata_correction。natural_v1原通用scope过宽也保留原输出后更正为三次自主击；所有观测数据不变。不是生产逻辑修复。

## 清理与复现

每个GL目录保留engine_pid.json、xorg_pid.json、process_exit.json；三对进程均正常退出。清理只涉及本QA生成的font/shader缓存，清单在generated_cache_cleanup.json。未清理原失败、帧、日志或输入包；最终目录约13MB。

run_review.py复用既有空res/App runner，使用白名单本地Xorg端口34109（display28109），需要新的空output。gl_v1可用test_knock_cycle.gd复跑；自然三击用capture_natural_variants.gd。固定视觉用run_phases.py与capture_contact_phases.gd。各已跑目录内保留fixture快照，避免历史结果与未来测试编辑混淆。不要把--path指向全资源工程。
