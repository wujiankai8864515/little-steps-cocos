# R9-L06 Core PCK HTTP缓存身份

宿主原来使用官方startGame，官方4.5.2内部preloadFile(pack,pack)把同一个字符串同时当HTTP URL与虚拟文件路径；新manifest仍可能命中旧index.pck的HTTP缓存。

修复只改宿主：以core的manifest SHA为查询参数请求同源URL，使用官方公开init+preloadFile(URL,core.path)+start流程，虚拟FS路径和--main-pack仍是index.pck。保留原args、WASM URL、进度账和实际ready/paint揭幕。URL对应fileSizes明确设置，进度不重复计数。

8项新回归覆盖URL/FS/args/大小/进度/单启动、hash切换、初始化/下载关闭迟到、三阶段失败、跨源拒绝。原4就绪+3网络重叠场景也重跑通过。

运行：
- `node build/performance_r9/core_cache/test_core_version.cjs "$PWD/build/web_host_seed/host/preboot.js"`
- `EXPECT_READY_DRIVEN=1 node build/performance_r9/loading/test_host_ready.cjs "$PWD/build/web_host_seed/host/preboot.js"`
- `EXPECT_OVERLAP=1 node build/performance_r9/host_overlap/test_host_overlap.cjs "$PWD/build/web_host_seed/host/preboot.js"`

官方API逐项本地核验与原runtime SHA在official_api_evidence.json。未改官方index.js/WASM。测试是确定性API模拟，不替代实际浏览器/CDN的请求URL及缓存刷新验证。关闭时官方公开preload API没有abort参数，已发网络可自行完成，但迟到完成不会再调用start或揭幕。
