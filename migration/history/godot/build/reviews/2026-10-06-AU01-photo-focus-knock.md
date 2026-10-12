# A036/AU01 照片墙焦点恢复后木鱼静音

触发：正式c242→Home有效手势→木鱼contact发声→打开照片墙→应用FOCUS_OUT→FOCUS_IN→照片返回→再次敲击。真实root输入，官方4.5.2、空res、原精确9PCK；焦点通知为测试注入。

确证根因：Home失焦会禁用 `world.knock`，恢复焦点只在 `input_enabled` 时启用。照片墙期间Home输入关闭，照片关闭原路径没有恢复音效端口。返回后实际敲击仍恰1次功德，真实AudioStreamPlayer没有出现playback。不是缺音频资源、音乐开关语义或MP3重复初始化。

修复：仅在photo_bridge关闭路径依据Home在树内、可处理以及共享应用活动状态，恢复独立木鱼音效端口。保留现有音乐设置仅作用于BGM/旅行钟声，不增加偏好持久化、不增音轨/播放器/资源。失焦、暂停或不在树内时不能由关闭动作开启声音。

验证：`../audio_lifecycle_review/evidence/baseline_headless.json` 39项有两个精确失败；仅photo_bridge.gdc官方token覆盖的TEST ONLY候选主门禁82/82，关闭/失败/取消专项25/25。修复后真实contact有一个实际AudioStreamPlayback、功德仍恰1次。20次灯输入、照片连点、重复configure、双MP3身份、设置与焦点转换及三页往返均保持；App销毁后所有指定页/音乐/双流弱引用释放。

QA纠偏：最初根viewport初始化时序使SubViewport canvas带1.777778渲染倍率，世界坐标不能直接当root输入；修正先初始化root尺寸及使用Home到root变换后真实灯20次均执行。第一次旅行map扫描只到y1080，而实际map位于y1080–1231，因此没有执行入口；扩大到实际可见命中范围后真实map入口通过。这些是QA点位错误，未作为产品缺陷修复。直接source-remap覆盖尝试无法解析，已弃用；当前使用官方编译gdc单文件PCK，原冻结包未变，实际读回token SHA一致。

生命周期纠偏：8个高速headless帧后偶有PCM尚未退休，场景和播放器已经释放。记录弱引用并按真实时钟等待最多2秒后，实际额外延迟28ms/0ms/21ms全部释放。未持有AudioStream强引用，测试记录仅数字ID、WeakRef和布尔；没有强制GC。合法的照片/暗室页缓存、资源缓存与音频线程短暂持有不能当持续泄漏。改测试判定窗口，没有为归零而改变产品缓存策略。

边界：驱动为headless Dummy。真实生产播放对象状态不等于扬声器听音；AU03正式Web首次解锁、createBuffer/解码、标签页事件、实际听音、性能时间线及浏览器内存仍待独立验证。未关闭所有A024/A036/A038历史主题；未push/部署/修改冻结PCK。关联组仍须GitHub读回之后同源正式包复验。
