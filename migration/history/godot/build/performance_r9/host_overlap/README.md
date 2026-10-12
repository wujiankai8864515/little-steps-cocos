# R9-L04 必要网络与宿主角色准备重叠

原序列：角色三图按原串行fetch/decode并绘制→两帧paint→manifest→engineJS→WASM/core。
新序列：角色准备与manifest/engineJS并行；两边都完成且角色仍有真实paint机会后才启动WASM/core。

未改图、动画采样、三图decode并发1、下载项、hash、同源检查、失败重试UI、App真实ready/首绘揭幕门禁。

`EXPECT_OVERLAP=1 node build/performance_r9/host_overlap/test_host_overlap.cjs "$PWD/build/web_host_seed/host/preboot.js"`

3场景验证：heldactor时manifest+engineJS已发起但engine.startGame未调用；actor失败保留失败/重试且不启动引擎；关闭后actor迟到不启动/聚焦。R9-L01宿主快速/慢资源/迟到/账不全4场景同时重跑通过。

这是确定性事件序列测试，无真实浏览器网速/首帧/内存性能承诺。物理PCK/解码图字节未动，仅消除串行网络等待。
