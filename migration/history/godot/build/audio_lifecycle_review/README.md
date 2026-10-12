# AU01/AU02 原生音频连点与跨页生命周期

本次唯一产品修复：A036/AU01，照片墙失焦后恢复焦点，再返回 Home，木鱼有功德却没有敲击声。

## 修复与证据

`photo/photo_bridge.gd::_close()` 现在恢复 Home 音效端口，并以 Home 在树内、可处理、共享应用活动状态为条件。照片页占输入时 `Home._notification(FOCUS_IN)` 不会重新启用音效；旧关闭路径只恢复输入，遗留 `knock._enabled=false`。原有“音乐”设置控制 BGM 和旅行钟声，修复没有将独立木鱼音效绑定到该设置。

- 正式 c242 的精确9包、空 res、真实 App/root 输入复现：首次敲击在真实 contact 有1个 AudioStreamPlayback、功德+1；照片墙失焦/恢复/返回后，contact 仍功德+1，但端口被禁用、没有实际 playback。基线39项中两个精准失败，见 `evidence/baseline_headless.json`。
- 只覆盖 `photo/photo_bridge.gdc` 的官方编译 TEST ONLY 候选：主门禁82/82通过；关闭/异常边界25/25通过。播放器没有被替换为 AudioSpy。正式原9个 PCK 未改。
- 主门禁通过真实 root 输入执行20次灯开关、12次照片入口连点、音乐开关和敲击；首次有效手势只启动双播放器一次。释放/取消触摸不启动，重复失焦、重复同态设置、重复 configure 不重建播放器/stream、不重复状态写。原生生产昼夜时钟产生约4秒连续混音，总线性增益保持 -24 dB 上限以内。
- 普通返回、Esc、失焦后Esc、缺包失败取消、慢加载取消与迟到完成、后台取消、应用暂停/恢复均有专项。BGM关闭后照片返回仍关闭，后台取消不重新开声。

## 生命周期观察

全部路径由真实页面入口/返回输入完成；旅行只用已有生产 service 建立隔离的有效行程夹具，未新增玩法。初始 Home 由 `App._commit_home` 省略本组无关的格漫，不代表完整网站冷入口通过。应用焦点/暂停通知由测试注入，不是 OS 或浏览器事件证据。

- 照片→Home：3轮同一照片缓存页，树节点498、对象2737、资源172均稳定。
- 暗室→Home：3轮同一暗室缓存页，返回后禁用且脱树；248个脱树节点属于明确保留的暗室页。树节点511稳定，对象3203→3205→3205，资源209稳定。
- 旅行→Home：3轮真实钟声 playing 时点击返回。场景立即 dispose、播放器 stop、stream=null；场景/播放器/PCM的弱引用均最终释放。返回后树节点528、对象3291、资源220稳定。
- 高频 headless 的8帧不等于音频线程释放窗口。首轮和第三轮8帧后仅 PCM尚存，实际再等28ms和21ms便释放；第二轮无需额外等待。没有强制GC或改合法缓存。本地AudioServer异步退休与短暂峰值不能写成泄漏。
- 结束销毁实际 App 后：App、Home、照片缓存页、暗室缓存页、共享音乐、两个播放器及两个独立MP3 stream，9个弱引用全部释放。
- 静态内存并不归零，且取样记录、资源缓存、页壳和时间运行都会影响数值。旅行三轮约320.045/320.066/320.222 MB，未伴随持续对象/资源数量增长。本次3轮有限观察不能推断长期或浏览器堆通过。

Home MP3流数据长2,020,909与3,339,071 bytes；两播放器/两stream ID在连点、设置和跨页中始终一致，start_count始终1。代码中duplicate只在首次configure。音频内部解码缓冲分配和实际听音不能由这些ID代替。

## 重跑与身份

`evidence/inputs.json` 固定每个原9PCK的 bytes/SHA256和官方4.5.2引擎身份。`evidence/candidate_identity.json` 固定唯一修复源码、官方gdc、单文件覆盖PCK和QA脚本；实际运行读回gdc hash与候选一致。空res目录运行前后都不含物理生产文件。延迟包仍由真实生产backend验证SHA并按入口动态挂载；最终9包均实际挂载。

在工程根执行（替换引擎/PCK绝对路径，输出必须为空目录）：

```sh
python3 build/audio_lifecycle_review/run_review.py --engine /absolute/Godot_v4.5.2-stable_linux.x86_64 --packs /absolute/c242/native_packs --output /absolute/new-audio-review --candidate
```

不加 `--candidate` 会在相同基线包上重现并要求精确两个旧缺陷失败。候选只复制生产gd以进行官方token编译，不复制大资源；实际测试仍是 `--path <empty_res> --main-pack <exact index.pck>`，再挂载仅含 `res://photo/photo_bridge.gdc` 的 TEST ONLY 覆盖包。不会自动构建/发布正式包。

本次实际运行命令保存在 `evidence/commands.txt`；原生绘制采用headless，音频驱动为Dummy。它证明真实生产播放器的状态/播放对象生命周期，不能证明扬声器输出、实际听感、Web首次交互解锁、createBuffer、浏览器解码峰值、标签页事件或手机卡顿。AU03仍待授权的正式Web会话独立验证。本次不将A024/A036/A038的全部Web/视觉要求关闭。

后续须随关联组从GitHub核验的同源正式包重跑。本报告不把测试覆盖包当正式发布，也未push、部署或修改冻结PCK。
