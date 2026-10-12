# R9-L05 按页面实际需要准备旅行资源

同一目录travel/page_resource_sets.gd定义三个解码/租约集合；App从原travel_visual+departure_visual过滤，Page按同一目录消费。原PCK拓扑、网络范围、图像/字体/材质/玩法均不变。只是新增一个无资源IO的数据代码目录。

## 实际测试

官方4.5.2、空res、原6327PCK、明确source-only候选覆层。完整最终App/Bridge/Page/catalog及已集成旅行依赖SHA见integrated_source_identity.json。

- 旧全模式：12项，60,543,140声明bytes，376ms本机headless。
- 收藏冷用：3项，14,227,028声明bytes，196ms。
- 日记/归档冷用：7项，43,842,536声明bytes，323ms。
- 地图/旅行冷用：9项，41,468,260声明bytes，273ms。
- 收藏→归档→地图→日记→收藏新增load分别3/4/5/0/0；最终union仍12项、60,543,140bytes。数字不是浏览器总内存或用户设备性能保证。

最终字节重复验证：实际App/Home完整模式链14检查、Page消费/归档状态12检查、App/Bridge失败重试/代际/并发/迟到Back/零参兼容19检查、实时Home背景归属7检查全部通过。实际App夹具为了隔离模式调用Comic完成回调，不能用于证明故事播放时长。

## 正确性边界

- 每种模式独立ready和持久租约；收藏成功不会误认为地图也准备好。
- 归档按钮先保留当前收藏，再请求Bridge异步准备；失败可重试、取消留原页、Back令迟到回调失效；保留选择索引和journal_id。
- 地图离开时恢复Home实时纹理，嵌套导航不覆盖最初ambient状态。
- 原zero-argument注入loader继续工作；无效模式在App失败关闭。
- 所有图保持原资源字节，物理包仍按现有travel_visual下载。此改动减少页面阻塞解码，不声称分包下载体积下降。

正式同源打包、真实Web网络/GPU及用户视觉仍需整组验证。已知软件GL Home首次材质绘制长停顿不是此处解决的问题。
