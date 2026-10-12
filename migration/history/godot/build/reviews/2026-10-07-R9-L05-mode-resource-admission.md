# R9-L05 全旅行资源阻塞收藏/日记复盘

## 确证根因

Bridge所有模式调用同一个无参loader，App用单travel_ready和全12项60.54MB估算批次，Page用_font非空直接跳过后续资源准备，却首次一次读全部页面素材。收藏仅用纸、书法字和日记底图，但被地图/人物/路线资源阻塞。收藏的归档按钮直接换mode，简单过滤会把归档所需资源读回阻塞路径。

## 修复

共享data-only脚本目录定义collection3/journal7/comic9；仍用原physicalpack，不改变包下载/容量。App各mode成功/lease独立、全局单飞合并重复请求、bootgeneration保护晚回调，retry清除各modelease。Bridge明确传mode并兼容零参loader，Page逐字段补齐，不用_font作为全页完成条件。归档按钮发navigation_requested让Bridge先准备，取消/失败保留页，Back使晚结果过期，收藏选择/journalid/ambient原态保留。整合原旅行优化上的noncomic背景viewport恢复。

## 实证

最终App/Bridge/Page/catalog字节SHA固定，真实原6327PCK实际模式链14检查通过；Page12、生命周期19、viewport7通过。实际冷gate：收藏12→3项且376→196ms，归档7、地图9；暖序列3/4/5/0/0次新load，最终unique12。估算bytes不是实测进程/GPU/Web内存。已有场景、材质、物理和演出时间不变。

## 夹具失败与防复发

- 两处Array[String]和Node2D测试替身类型错误修正为兼容类型；不属产品失败。
- 同步在gate完成信号里freeApp造成“previously freed”，改夹具call_deferred结束，避免在scheduler栈内销毁；生产未以此更改玩法。
- 稀疏cherry-pick删去物化但已暂存源，导致一次App路径缺失；从精确index选定文件恢复后重新检查。
- 初版foreign-path原始GD别名覆层触发编译基线preload无法解析，保留失败边界并弃用该方式。最终使用已验证same-canonical-path source+self-remap，脚本无任何文本重写，完整实际链通过，检查日志无SCRIPT ERROR/ERROR。覆层始终显式参数，绝不当正式包。

## 未验

正式编译/冷包/真实浏览器和GPU整体复测由冻结同源版本完成。当前实际链headless、Comic完成回调是测试隔离，不能证明故事节奏、画面或软件GL8.55s首次材质编译卡顿已解决。
