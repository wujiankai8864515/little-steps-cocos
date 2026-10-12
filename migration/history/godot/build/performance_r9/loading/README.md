# R9-L01：按真实就绪结束加载

基线源码6327bdb。原生组件证据用该版本不可变PCK，只有App脚本通过显式参数替换为候选；不是正式新包/浏览器/GPU验收。

## 可重复的轻量检查

1. Node宿主测试：
   `EXPECT_READY_DRIVEN=1 node build/performance_r9/loading/test_host_ready.cjs "$PWD/build/web_host_seed/host/preboot.js"`
   测试模拟宿主API，覆盖快速就绪、慢登录、关闭后迟到就绪、下载账不完整；不冒称真实浏览器性能。
2. 官方4.5.2 headless实际加载：新建空res项目，使用本目录test_app_ready.gd，参数依次为不可变native_packs目录、候选App绝对路径、结果JSON绝对路径。设置独立HOME、XDG_DATA_HOME、XDG_CONFIG_HOME、XDG_CACHE_HOME并加--max-fps60。先挂载core，显式native manifest，再真实按需挂载entry。
3. baseline使用6327bdb的App；candidate使用本改动App。两个版本均到实际LOGIN才停止，首个演出状态TITLE保持，小鱼/鳍仍隐藏。

## 本次测量

- unchanged baseline：loading minimum1000ms，LOGIN1443ms。
- source candidate：真实资源准备233ms，LOGIN677ms。相同0.38s过渡保留。
- 确定性宿主：112ms时，旧代码仍覆盖就绪画面，新代码完成真实就绪条件及两次绘制机会后揭幕。
- 此数据是本机隔离headless/模拟宿主范围，不是用户设备加载时间保证。

旧startup_ready_review和round5夹具的硬1秒断言已被最新性能要求覆盖，不应继续用于本批验收；没有修改历史冻结结果。
