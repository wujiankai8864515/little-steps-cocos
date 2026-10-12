# H10 / A061：旅行纸牌真实受光与接地

已实际查看用户图 `image(20261006-142937).png`。故障根因：`travel_home_props.gd` 的纸牌 Polygon2D 与 ApprovedContact 均没有 receiver，亦未加入 world.receivers；原画因此无法接收本室的日月/灯光状态。不是原画像素或明暗贴图问题。

本提交只改该脚本的纸牌受光与投影。保留 HD 纹理、接地原裁片、三个原三角形、全部 UV、五点位置及坐垫中心锚点；两层各注册现有 receiver。地影复用 home_grounded_shadow shader 与纸牌自身 alpha，使用同一五点/UV 三角 mesh 及原下缘支撑线，提供日月、台灯与窄 alpha 接地三 pass。绝对 z=1 留在地面，随纸牌 away/return 可见性清理。无新纹理、mask、字体或资源 entry；新图片解码预算为 0；128 entry/256 MiB 限制不变。

验证为官方 4.5.2 + Mesa llvmpipe 实际 GL。空 res 根加载冻结 561 的 index.pck，真实 App 动态挂载 house/exterior；只叠加本脚本编译 delta 和 H08 已核日记 delta。没有从全资源工程启动冒充冷加载。H10运行不请求 travel PCK。测试源码为 `build/checks/test_cold_paper_lighting.gd`，参数为冻结 pack 根、输出、baseline|fixed，以及可选脚本 delta PCK 列表。

`/tmp/paper_cues_qa/h10_verified` 最终运行 34项通过，0失败、0 SCRIPT ERROR、无 ObjectDB 退出警告。实际查看了白天关灯、夜晚关/开灯细节及返家拖鱼全图。原牌从白天暖色变为夜晚蓝暗色，灯开后增亮；逐组关闭真实投影并比较地面渲染像素，均有对应变化。实际长按拖起返家鱼，纸牌及其投影不复现。保留原几何、world receiver注销与三个投影节点释放均验证。结果摘要含冻结7包SHA256，见相邻 JSON。

QA修正记录：第一次主动单独 queue_free props 后，桥接器仍在 process 中调用它，产生测试夹具错误；先停拥有它的bridge，再释放props并验证注销，最后释放Home，重跑后无错误/退出泄漏。未修改无关桥接器或产品生命周期。

边界：以上不是正式合并组包、Web、用户设备 GPU、移动触感或用户视觉接受。最终7PCK、首屏总字节、准入与源代码备份由集成阶段统一核验；不逐项另建完整归档。

整合预算补充：虽然未增加图像和entry，新建共享alpha mesh、3个投影节点/材质和记录仍有运行对象。现以保守131072B显式绑定已存在home_tent_hd_v1纹理owner，真实App准入会计入；不是浏览器内存测量。联合photos/labels/collection后128entry、262415380B，未放宽阈值。
