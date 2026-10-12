# 香炉燃香组有限验收：A019 / A020 / A042 / A045

正式 e394bda 基线未发现需修源码的具体缺陷。此次只补证据，不修改源码、PCK，不 push/deploy，也不把原生通过写成 Web 或用户视觉认可。

## 实际执行

- 冻结源码：`e394bda99cab432c27d351953c2d7ba2227d8384`，核查前后工作树干净。
- 正式9个PCK：`/workspace/scratch/3f82ff2b3f81/darkroom_entry_formal_e394bda/native_packs`；每轮前后 SHA256 一致。
- 官方 Godot 4.5.2，SHA256 `5803746bbe055bee0f07a3c5b0dd347719bd45599f3d34519a8a0beaf83014ae`。
- 空 res 根只有 project.godot。直接 `--main-pack index.pck`，生产 App + native backend 正常动态挂载 core/entry/comic/exterior/house，没有源文件 fallback 或 overlay；Home 不挂 travel_visual/darkroom。
- 只省略无关漫画，通过 `_commit_home` 激活生产 Home；点香、鱼 alpha 敲击、灯开关全部从 root 输入走原生产处理。没有直接调用 ignite 或奖励结算。
- `--max-fps 60`，使用普通墙钟/单调钟，完整30秒燃香，未注入时钟、未使用固定帧率加速。
- 日夜/太阳角度采用现有 review-hour 窄夹具；focus 是组件通知探针，不冒充 OS 真后台。截图是原生 Mesa GL 软件渲染，不代表设备 GPU/手机操作体验。

## 通过的有限内容

共111条真实包检查：生命周期48、跨进程种子12、活跃恢复30、过期恢复11、太阳角度10。原始运行结果在对应目录 results.json；聚合在 verdict.json。

- A019：预加载及进入Home前不燃烧；凳上香炉独立点击点燃，不需要小余动作；取消触摸不点燃；燃烧中点香显示“还没燃尽”，原开始时间、deadline和数量不变；燃尽后真实触摸再次点燃一次。
- A020（本组只核炉/香）：材质、纹理和实际阴影节点均在生产树；逐view 8/12/16点画面，接触影贴在炉脚，投影随日光方向及高度改变。炉身昼夜色调变化，香有细纹、可见点燃火头，并随燃烧缩短。完整花瓶/凳面交互证据归前一Home组，本次不重做。
- A042：逐view 首烟、中段、27秒、29.5秒、刚燃尽、尾烟扩散及消失帧；初烟较淡但可见，烟带弯曲漂移，燃尽后仍有残烟扩散并淡去，未见硬矩形裁切边。这里是查看实际画面的有限判断，不等于用户美术验收。
- A045：未点燃的真实鱼击 +1，燃香中真实触摸鱼击 +2，燃尽后 +1；按实际槌触碰结算一次，屏幕奖励字图和右上累计一致，触摸伴随模拟鼠标不重复结算。背景自动敲击保持原设计，也经过同一奖励provider，累计数不能简单只按手动次数推算。
- 跨进程恢复：真点击种子→退出→同slot空res新进程，严格保存同一开始时间/deadline，剩余时间扣真实间隔；+2仍生效，原deadline燃尽后+1；第三个进程读过期存档保持未点燃，不自燃。Web localStorage真刷新仍未验证。

夜灯开/关图片也逐view。炉位于灯的有效范围边缘，局部暖光变化很小，不能用整屋明显变亮代替“香炉受光”证据；随光源变化主要由额外太阳角度帧建立。

## 资源实查

resource_audit.json 从正式 PCK 目录和实际bytes核了34个相关成员：独立香炉/存档/气泡/字体选择/字图/台面接影脚本、bootstrap字体、香炉ctex、功德及引导ctex、接影/香shader及include。均与正式inventory的bytes/SHA一致。烟由包内 independent_incense 的 ArrayMesh 生成并实际绘制，无遗漏的独立“烟图片”依赖。

## 保存的夹具红与更正

1. e394_v1 假定22点自动灯已开，实际初始关，所以开/关断言倒置；同时烟特写ROI误在右上。产品真实点灯正确。该轮日志、结果和高质量JPEG保留，误ROI帧不作为烟证据。`check_fixture_v1.gd`与原运行记录hash严格相同。
2. e394_v2 生命周期48/48；恢复夹具默认JSON输出截断秒值4.053微秒却严格比较float导致1条红。生产保存本来就用full_precision。只重跑修正的 seed→restore→expired 有限链，e394_restore_v3严格身份比较53/53，无产品修复。

## 文件与重跑

- `verdict.json`：聚合结论、每条边界、查看的图片、时间/烟/香长度快照。
- `matrix_evidence_proposal.json`：四条schema2原始sources/current_status及建议新增有限原生证据；未修改原矩阵。
- `e394_v2/lifecycle/`：完整30秒、日夜、烟尾、奖励、重燃。
- `e394_restore_v3/`：修正精度后的三进程恢复证据。
- `e394_light_v4/light/`：8/12/16点投影帧。
- `lighting_detail.jpg` / `relight_detail.jpg`：便于查看的裁剪放大图，只作视觉辅助。
- 工程内统一重跑入口为 `run_review.py --stage lifecycle|restore|light --engine <官方引擎> --packs <精确PCK根> --pack-label <来源标识> --output <新空目录>`，见 README.md。三个场景脚本与对应真实执行字节完全相同。
- 外置原 `run.py`保留曾触发精度夹具红的链，非推荐回归入口。历史实际命令原样保存在每轮 command.json。

本人启动的Xorg/Godot均已结束，PID和清理记录在各轮pids.json；只清理自己生成的可重建shader/cache，保留日志、结果、种子和图片，全部QA约11MB。

尚未覆盖：Web localStorage真实刷新、浏览器内存/性能、用户设备GPU、真实手机触摸、此组高屏比例和用户视觉认可。不能据此将四条整主题验收状态改为已认可。
