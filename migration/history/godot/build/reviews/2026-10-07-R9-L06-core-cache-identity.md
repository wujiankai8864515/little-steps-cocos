# R9-L06 发布前Core缓存身份阻塞复盘

## 触发与根因

发布检查指出HTML/manifest已更新仍可能在缓存期取旧index.pck。核对固定官方4.5.2 index.js：loadFetch使用默认fetch(file)，startGame把mainPack同时作URL和FS目的地，没有自动基于hash加版本。仅给宿主脚本加版本不足以改变core请求身份。

## 最小修复

宿主保留canonical mainPack和args，构造同源coreURL并设置sha256参数；fileSizes同时有canonical键及实际URL键。按照官方公开API原顺序并行init(executable)+preloadFile(coreURL,core.path)，两者完成且未关闭/失败才start。start本身复用已初始化promise。未改官方runtime、WASM、分包拓扑、资源内容或玩法。

## 验证

8个新API场景和原4就绪+3重叠场景全通过，node语法检查通过。两个hash生成不同HTTP请求但同一FS路径；原args完整保留、--main-pack只添加一次；只调用一次start、大小与累计进度不翻倍。初始化/下载迟到关闭不再启动；init/preload/start失败保留失败与Retry；跨源core在启动前拒绝。官方runtime SHA前后保持8a7c7d57f7da69bb71da9de302480b87e4c7ecb467ce643665b4a288683cd18f。

## 剩余边界

这是缓存身份修复，不新增下载core的SHA计算，也不声称真实CDN或浏览器已验。需新正式Web包实际核请求URL、canonical虚拟FS成功入口以及旧缓存更新路径。官方preload没有可传的AbortSignal；关闭后可能仍有在途网络，但host防止迟到引擎启动和揭幕。
