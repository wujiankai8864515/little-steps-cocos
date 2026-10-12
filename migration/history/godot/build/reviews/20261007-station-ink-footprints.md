# 站点脚印：仅到达时一次落印的实质候选

最新用户范围：把沿途小物件换有手绘材质脚印，只有实际到站逐个落下/压实/凸显；恢复历史不播、未来不预铺。站牌、路径、结算不改。

## 根因与改动
原_draw_route无到达绘制门槛，每个节点无条件画图集石头/门楼，仅以progress区分颜色，未来也预铺。本次移除这一段，改共用真实透明纸墨脚印PNG。每帧仅到达节点存在记录；新到达记录一次age，0.28s下落、接着0.30s轻压回弹、1.15s内淡去局部暖光，静态历史不受影响。跨帧多站快照使用_next_stamp_time逐个排队，不把以后节点放进表。

首次/恢复seed当前已到站为静态，trip ID变更显式seed；新Scene/reopen从真实Service snapshot初始化，后续相同快照不重播。角色/route Bezier几何/站牌内容和结算代码完全不改。脚印底层绘制中心沿原站位向下12px以免被小鱼完全遮住，不移动路线本身。

## 素材与像素门禁
程序自绘鞋底试案在小尺寸下仍像两块印形，已否决并从生产代码删除。最终采用内置image_gen生成的单枚纸墨足印真实透明原画；完整prompt、原始PNG、固定hash和确定性裁切/缩图脚本在design/travel_footprint_ink。不是“已有认可原画”。

生产仅travel/assets/travel_footprint_ink_v1.png，96×128 RGBA8、49,152解码bytes，无mip；每枚显示17×29，DPR2/3仍不超源纹理采样尺寸，左右两枚共用同纹理。生产PNG约16KB；114,688B门禁估计含64KiB资源开销。master仅design，不进运行包。物理目标travel.pck，integrator须加入travel_visual声明与预算；本分支未改共享manifest。

初次官方导入像素核失败，确因默认process/fix_alpha_border=true重写透明RGB；不能把仅肉眼无差当lossless。已提供明确false .import，官方重导后实际CompressedTexture2D.get_image RGBA逐字节等于源PNG，无预乘、无重染。

## 实际验证
- 官方4.5.2小编译通过，源码config/runtime/page + PNG官方ctex共8项组成76KB CANDIDATE_ONLY覆盖包；固定当前197ee6c正式PCK资源。
- 真App→Home→Travel→Service跨第一站：21检查全过，7段动帧实际看过。一次出现/下落/压实/保留；同快照不重播；退出dispose清理；同程关闭页面45s再开仅0–4站静态，后面无足印。
- 独立第二OS进程，生产Native Store读取前轮校验信封、Service.configure和Page恢复：19检查全过。45%恢复历史5站静态，0/0.43/1.4s不回播；50.2%仅新第5站动画，历史时间戳不变，未来第6站无图。这个测试是native磁盘，不冒充浏览器localStorage。
- CPU 19检查补充跨多个节点且后续快照继续跨站的排队顺序、重置、材质48KiB、dispose引用清理。
- 图片已实看原画、运行尺寸、阶段对照、恢复与夜间。恢复截图顶部/底部空标签是fixture在reopen后立即冻结page._process所致；新进程后续帧/生产正常process会刷新标签，本次没有改标签逻辑。

## 复盘与未验边界
首次小CPU probe遗漏隔离XDG，默认只读目录启动失败；改到明确可写的隔离cache/config/data后通过。第一轮GL只因导入像素核失败，按上文修复后重新编译、重新整轮验。保存信封来自隔离QA槽，无用户存档修改。

仍须根线程将PNG纳真实travel资源组/物理包并核累计与阶段预算，从冻结整合源正式构建/空res冷动态mount，再核浏览器。当前overlay只证明实际生产入口+编译代码/素材绑定，不能代替最终资源声明和用户视觉验收。此前N18与N16独立提交保留，落叶179c8fd也保留独立历史。
