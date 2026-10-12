# R9-AU01：正常关闭时等待音频实际释放

## 触发条件与确证根因

基线 6327bdb 的 HomeMusic 正在播放时直接退出 Godot 4.5.2，退出日志可保留两个 AudioStreamMP3 克隆和两个 AudioStreamPlaybackMP3。音乐专用空 res/PCK 夹具重现：立即 quit、dispose 后立即 quit、free 后立即 quit 均出现相同四对象告警；先 dispose/free 并等待弱引用失效则无该告警。它不是衣柜页节点不断增长的证据，也不是浏览器内存无泄漏的证明。

官方引擎源码解释了实测：stop 将流标记为待淡出删除，混音步骤完成后还需主线程清理，故最后一刻 stop 不等于对象已释放。来源：https://raw.githubusercontent.com/godotengine/godot/4.5.2-stable/servers/audio_server.cpp（stop_playback_stream、_mix_step、_delete_stream_playback_list_node、update）。

HomeMusic._exit_tree 必须保留 pause：App 首次进入 Home 会将同一个音乐节点 reparent 成共享音乐；在该回调直接 dispose 会破坏正常交接。此次不改音乐文件、音轨、循环、音量、交叉淡化、手势解锁和静音逻辑。

## 实际修复

- App 持有期间关闭 SceneTree.auto_accept_quit，保存并在非退出销毁时恢复原设置。
- 正常 WM_CLOSE_REQUEST 进入幂等 request_quit。先终止加载/过渡回调并停页面处理，再收集 App 和离树缓存页面里的播放器。
- 只保留播放实例的 WeakRef；同步 dispose 共享 HomeMusic、停止播放器并释放 stream。每帧观察弱引用是否清空；不是固定等待 20 帧。
- 等待上限为单调时钟 1000ms。超时明确报告剩余数量并返回非零退出码，避免无限挂住或把未释放误报通过。
- App._exit_tree 复用取消和同步音频释放，普通 App free 后引擎继续运行可完成混音回收。

## 回归与证据边界

build/performance_r9/audio/evidence/summary.json 是汇总；配套 JSON 保留各断言、实际源码 SHA、官方引擎及基础 PCK SHA。全部产品验证是显式 App 源码候选 remap 加 6327 正式基础包，不能称正式同源重建。只有这一个 App 脚本被覆盖，不替换任何图/音轨/字体或资源预算。

覆盖启动中关闭、未手势播放关闭、播放中关闭、焦点暂停、音乐关闭、重复关闭请求、Home↔Darkroom 三次往返、离树 Home 时关闭、重复 App free，以及人为持有一个 playback 的有界超时。正常路径播放器和流身份不变。真实 OS 测试通过 X11 WM_PROTOCOLS/WM_DELETE_WINDOW 发送窗口关闭事件，不把直接调用通知当作真实窗口关闭。

全项目正式构建/部署/Web/手机音频与硬件听感仍待关联组验证。浏览器强制关标签、进程终止和绕过 request_quit 的 SceneTree.quit 不提供等待机会；显式 forced 夹具记录这一剩余边界。此改动清理正常退出，不声称降低游戏中常驻纹理内存或证明全部平台无泄漏。

## 本轮测试失败复盘

1. 首个夹具从 SceneTree 直接引用 Node.NOTIFICATION_WM_CLOSE_REQUEST 时省略 Node 前缀，脚本解析失败。修复夹具常量限定后重跑。
2. 第二次断言误以为资源 remap 会改变 GDScript.resource_path。运行路径仍为原逻辑路径，实际候选已执行。改为逐字源码及 SHA 校验，保留真实逻辑路径；不靠自报候选字样。
3. 首次裸 Xorg 无窗口管理器；Godot 启动时以 only_if_exists 读取 WM_DELETE_WINDOW 原子得到空值，之后才由驱动创建原子，发送事件未匹配。测试驱动改为引擎启动前创建真实 WM 必备协议原子后重跑成功。旧运行超时后强制拆掉显示连接产生的清理错误保留为失败夹具边界，未当作产品通过。

## 重跑

在源码根运行：

    python3 build/performance_r9/audio/run_candidate.py --engine /absolute/Godot_v4.5.2-stable_linux.x86_64 --packs /absolute/round8_formal_6327bdb/native_packs --output /absolute/new-headless-output

仅当没有其他 GL 性能测试时运行实际 X11 关闭：

    python3 build/performance_r9/audio/run_os_close.py --engine /absolute/Godot_v4.5.2-stable_linux.x86_64 --packs /absolute/round8_formal_6327bdb/native_packs --output /absolute/new-gl-output

输出目录应全新；运行不复制资源、不进行完整构建、不更改用户存档。原生运行使用隔离 HOME/XDG 和 Dummy 音频驱动，实际播放器与释放可观测，未做听音判断。
