# N27 归来开包柔软云卷

根因：原32枚diamond沿高抛贝塞尔四散+双线trail+两份echo，形成硬喷射；与用户认可的常驻包上星光为不同函数。删掉硬喷射实现，替换为两片暗室净化同一张真实软云画，错开.18s、低速上浮26px/s、连续扩张/UV翻卷、3.2s有限淡入淡出；两个复用Sprite，无每帧node/tween分配。原包上星光函数和近包悬浮→点击Bezier→一次结算代码逐字节一致（provenance有核验）。

资源：沿用darkroom/assets/release.png及ctex的同一字节，归属从darkroom迁至shared_room_visual/exterior；Home与暗室既有共同依赖，不让Home预载暗室或旅行。无新增条目、无图像编辑。原图已查看并同风格复用。真实候选PCK迁移两member，ctex386084 bytes，Home实际house+exterior=18,513,528 bytes <19,000,000。准入126 entries /254,317,548 bytes、Home67 specs，仍128/256MiB/80门限。请整组最终构建重核，不能以此代正式包预算。

实际运行：官方4.5.2候选core+迁移后exterior/darkroom，其余正式7ba4243 PCK。空res生产App真实冷Home，无暗室包时云texture已可用。根输入打开包后确定性冻结相位.45/1.35/2.65秒、昼/夜共4实帧，查看软云卷、物件保持近包悬浮、星光独立可见。恢复过程后根输入重复点物品，2奖励各完成Bezier一次，inventory=2不重复，flight visuals清空，云有限收尾。15检查全通过且无资源/shader错误。相位截图是显式时间采样，非声称实时时序影片。

迁移回归：独立空res冷exterior后尚无暗室needle，但release可读；再挂候选darkroom，全部原resource_contract资产加载成功，原净化两cloud共用同一个Texture对象、结束清理正常。没有重写暗室净化功能。灯开关/WebGPU/手机触摸/浏览器内存/用户审美和正式部署待整组复验。
