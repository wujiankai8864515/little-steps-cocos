# 启动资源真实退役与可选页并存实证（纯QA）

## 结论与范围

34项检查零失败。测试复用N27候选实际PCK，源码绑定44bb2eb生产修改、1037021 QA基线；并非后来整合新photo/travel资产的91/111静态闭包，也不是新增衣柜资产运行验收。无生产代码修改、无资源overlay、空res真实App、实际ResourceLoader backend；native backend只替换PCK获取路径。测试自身只持WeakRef，不保存Resource强引用，不主动free/release/trim。

## 实际路径及结果

- Login/Comic/Home均准备好：84 entries /152,191,384 bytes。
- 启动进入中取消、真实Comic进入后取消回Login：仍84，保留继续启动所需资源；取消的Comic节点在随后帧中释放。
- 再入Comic，等待真实揭示允许advance，调用生产advance完成故事，再经真实router进入Home。没有跳过Comic或直接调用_commit_home。
- Home后8帧：67 entries /109,488,856 bytes。17项启动独有资源全部gate条目移除、holder不存在、WeakRef失效、ResourceLoader.has_cached=false。覆盖10项实际纹理资源（含AtlasTexture）、FontFile、3个WAV、2个PackedScene及Shader。Login/Comic页面弱引用失效。共享bootstrap/loading资源未错误纳入应退役集合。
- 打开并关闭photo：69 /123,515,512，photo节点与batch继续常驻。
- 再打开并关闭travel，photo仍保留：80 /183,954,516。
- departure真实batch同时持有仍80（与travel共享，holder明细已记录）。
- 打开darkroom再回Home：104 /215,145,792，photo、travel、darkroom三个节点同时存活；没有假设互斥。全过程逐帧峰值104 /215,145,792，低于128 /268,435,456；admission_rejections=0。

完整逐阶段gate.snapshot_metrics、每个entry的holder batch IDs、弱引用/cache结果在results.json；简表在stage_summary.json。PCK hash、引擎、空res范围在summary.json；测试源码与源绑定同提交。

## 内存与未验边界

原生Mesa实际render texture monitor峰值249,069,642 bytes；它不是浏览器heap、GPU驱动或进程RSS的通用测量。PCK仍mount，来源文件映射/压缩字节不保证卸载。gate的66次budget_overruns是每帧处理时间预算超时，不是entry/保留内存上限越界；不能据本测试声称60fps或Web内存通过。

本实证支持“启动资源在不可返Login的Home阶段真实退役”这个机制前提。后来整合资产、未来衣柜两资源约13.71MB只能结合各自静态声明做独立评估，仍须同源实际最终包检查，不能用本候选104条直接替代整合111条或总表128条结果。
