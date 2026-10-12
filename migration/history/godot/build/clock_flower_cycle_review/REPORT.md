# A017 / A041：d1 正式 PCK 有限专项

结论：本轮限定原生门禁未发现已确证产品红。三次最终进程共 200 个状态/文件检查均通过，且相关实际 GL 图已查看。这里不是 Web、手机、听音、硬件 60fps 或用户美术认可。

## 对象与隔离

- 源码 d1bfcaa0bb4ddf2f9980e27e7fabd3b22d8b8b0c，源快照 904745318e53d4c356b4082395c06f86266655be77cac17f0e1fd61ade469f4d。只读源码、AGENTS/PRODUCTION 及 A017/A041 全部来源。
- 官方 Godot 4.5.2，SHA256 5803746bbe055bee0f07a3c5b0dd347719bd45599f3d34519a8a0beaf83014ae。未使用 PATH 4.6。
- 每次从只含 project.godot 的空 res 根，以正式 index.pck 启动真实 App；实际生产 native backend 按需取包并验 SHA/mount。没有任何资源 overlay、全资源 path 或生产树写入。
- real_cycle 原样运行共享钟和 Home 动效，仅用限定夹具跳过漫画转入 Home；跨页通过实际 App 暗室路由和旅行 bridge，旅行进度使用明确 service.depart fixture，不扩成完整旅途流程。
- 源包九个文件 hash 与引擎/脚本 hash 均由 runner 运行前后比对。实际取包记录见每轮 results.json。`source=injected_simulated` 是生产 PackService 对注入入口的固定标签；注入对象是原生产 pack_service_backend.gd，其 native_root 指向正式包目录，所有 ready 回调记录实际路径/bytes/SHA，未使用模拟载荷。

## A017 分层结论

源码：配置白昼 30 秒、夜 30 秒，夜 15 秒起开灯，2 秒淡入，天亮前 7 至 5 秒淡出；active-only 时钟，恢复略过首个可能过大帧，不发明离线补时。

资源：共享钟/App/各页面相关实际 PCK 成员已读回哈希核对。真实 Home 先挂 core/entry/comic/exterior/house，暗室和旅行仅随本次路线后续挂载；无资源错误。

运行：real_cycle 未 fixed-fps 或加速，time_scale=1、max-fps=60。观察 68.907 秒真实墙钟，对应 68.373319 活跃秒；软件渲染/readback 等开销使两者有约 0.534 秒差异，不能据此宣称设备精确 60fps。全周期 60 秒与白夜各 30 秒的当前规则符合；半秒采样中完整夜段为 30.0625 活跃秒 / 30.260 墙钟秒，属于采样窗口而非精确边界计时。

真实阶段：周期 36.0447 秒月光能量 .7、灯 0；48.0083 秒灯 .78；56.0300 秒灯 0；到下一晨光阶段。Home、暗室 page/world、Travel scene 均持有同一个 App clock 实例，页间活跃时间继续而不重复 tick；原生 focus/paused 通知冻结花与钟，focus-in while paused 不恢复，resumed 仅按后续时间前进。

画面：已查看月光未开灯与暖灯整屏、黎明前熄灯和晨光局部，阶段可见。原生画面不等于 Web 或用户认可。

## A041 分层结论

源码：初始 1 朵，每累计完整 60 活跃秒添 1 朵，8 秒长茎、展叶、开花，最多保留 10 朵；旧档只迁到 geometry2，不补发，旧花龄枯萎/消退未恢复。白昼虚拟太阳以花瓶为基准走上半圆；真实窗光坐标不影响朝向。

资源：37 个相关实际 PCK 成员读回校验。花盘、叶、瓶实际 .ctex/.import 均归 house，另核 flower_receiver.gdshader。三张原 PNG 在恢复树缺失，当前依赖经 original inventory 和正式 source manifest 双重固定的原导入缓存，不冒称本轮新导入。运行解码得到花盘 1024×512、叶 256×171、瓶 320×389，实际 RGBA8 哈希、无 mip 状态及 shader 路径见 results.json。

真实生命周期：冷 Home 1 朵；第 2 朵在模型 60.025463 活跃秒首次采得，距观察起点 60.642 墙钟秒；4 秒中间成长和 8 秒成熟分别真实取图。根固定误差 0。真实观察同时记录慢闭合/白天恢复，不拿 seek 结果冒充真实时间。

显式存档/状态夹具：旧 schema3 geometry1 的 5 朵档通过真实 Home configure→Store→restore 迁移，数量、ID 与下个边界保持；生产 Life 生成的 9 朵/539 秒档写盘后读回，540 秒只添第 10 朵；再模拟 10 天不发新 ID。最终保存由另一个新进程读取，10 朵的 ID、born、height、bend、root_x、phase、head_size 与 next_birth 均保持，再跨下一日仍无第 11 朵。fixture/reload 中 seek 的是共用 cycle，花用其同步 pose；这些是状态验证，不是实际经过 10 天。

画面：已查看旧 5 朵与 10 朵晨/午/暮实际 GL，花高、左右弯曲错落可辨，根留在瓶口且花茎方向与花盘协调。10 朵三时相高度跨度 110.89/94.74/81.42 局部像素，最小中心间距 30.476；数字仅辅助查看。夜间 3 秒各朵闭合进度 .13–.394，9.5 秒均闭；实际小余 ActionMarks 同一黄色粗线 ZZ 在花束上可见，白天复开。原画风/拥挤程度最终仍需用户认可。

## 保红的夹具错误与修正

1. fixture_parse_fail：外部 checker 对动态 get_script 路径用了类型推断，Godot 解析失败；改显式 String。尚未执行产品时即失败。
2. fixture_unposed_fail：外部夹具替换模型并建立新 stem 后，尚未 pose 就读取 last_points[-1]；加零 delta pose 后采样。该轮即使检查计数为零失败也因引擎 ERROR 保红，未采纳为通过。

两轮原始日志、runner summary、对应脚本和已有帧全部保留。修正后 real_cycle、fixture、reload 均无 SCRIPT ERROR / ERROR，所有 engine 和 Xorg 已退出且 wait，详情见 process_exit.json。已清本次可重建 shader/font 缓存，保留真实存档和原记录；目录约 12.8MB。

## 入口与结果

- assessment.json：A017/A041 source/resource/runtime/view/deployed/Web_user 独立状态，可据此更新外部矩阵。
- source_resource_provenance.json：全来源、源码与正式 manifest 哈希、37 个实际 PCK 成员、恢复缓存链。
- real_cycle/results.json、fixture/results.json、reload/results.json：当前正式包运行事实、实际纹理/material、真实 clock 引用、保存读回与图。
- real_growth_phases.jpg、bouquet_day_phases.jpg、night_ZZ_detail.png：只拼排/等像素放大的原截图，不重画。
- 部署：本轮未重新核验站点或 Web，仅接受父任务所提供 d1 Sitev7 背景。未 push、部署或改生产文件。
