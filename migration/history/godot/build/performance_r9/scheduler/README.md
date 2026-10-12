# R9-L02：有预算的同帧顺序资源收尾

基线源码6327bdb。旧后端在start内已经同步完成load，gate却强制下一帧take；max_starts单独加大也无效。

## 改动与边界

- 在顺序后端、剩余2ms切片预算及finish操作额度内立即consume已完成的资源，随后可启动下一件。
- App的每帧start/finish小操作上限1→8；后台并发仍只有1。通用gate默认选项不变。
- 保留80specs/batch、128entries、256MiB、优先级/取消代际/失败重试/超时/租约。
- 每个ResourceLoader.load本身不可切断；大纹理decode仍会超过2ms。完成回调也可能执行页面构造。因此2ms是下一次工作的准入预算，绝非硬实时上限。超预算仍完整计数，不再启动更多工作。
- 没有增删、压缩、降分辨率、改材质/灯光/动画或物理。

## 证据

- 原版68个tiny真实Resource：69scheduler ticks；仅把原版操作上限改8仍69ticks。
- 候选8cap：同样68项9ticks。此轮CPU15.438ms、max_process1.975ms；其他单次运行/默认1cap有系统调度波动，如实保留日志，不是固定性能承诺。
- 注入后端46检查通过：预算/上限、优先级、共享去重/暖缓存/释放、重试、缺资源、排队取消/在途迟到取消、代际替换、超时、回调重入、准入硬门槛、模拟异步2并发。
- 显式App+gate候选实际6327PCK：LOGIN606ms，资源准备167ms；对照R9-L01保持旧gate的677/233ms。13真实资源各1次，无非必要PCK、无准入失败。最大单个调度22.598ms仍来自不可切分真实decode，不把更快入口写成卡顿消失。
- 候选Gate只在夹具改class_name别名以避开正式包的同名全局类，逻辑字节完全一致，source_candidate_identity.json固定原/夹具SHA。正式源class_name未改。

## 重跑

`python3 build/performance_r9/scheduler/run_scheduler.py --engine /absolute/official4.5.2 --source-root /absolute/repo --output /absolute/new-empty-directory`

加--baseline用于旧gate源；run脚本自行复制三个小脚本、68个tinyResource，隔离四个用户数据目录；不复制美术或构建整包。

实际入口夹具test_app_scheduler.gd参数：正式native_packs路径、App源路径、输出JSON、显式QA别名gate路径。该源码候选证据不替代同源正式包、真实Web和GPU回归。
