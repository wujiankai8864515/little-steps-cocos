# A015/A037/A080 入口补证：QA 坐标误映射复盘

本次没有产品修复。正式 bc1 9 包只读；构建/资源与游戏代码均未改。

- 触发：v1 将 RoomViewport 的按钮 canvas 坐标当作 root 输入，想点好呀却点到气泡外。
- 证据：build/home_entry_feedback_review/headless_v1 保留原脚本、hash、输入、decision=false 和级联红；当时可能由外点产生的取消绿作废。
- 确证根因：QA 叠入离屏 render-scale 并遗漏 Home root 偏移。旧点(530.6666,1092.444)，正确root点(578.4999,614.5)。没有缺包/资源或生产触摸错误。
- 修正：仅QA先Control global→world local→Home root，再以生产_world_pointer与_target_at反算真实可见可用yes按钮；记录按钮路径/坐标/rect/结果。
- 回归：v2全链气泡确认与取消全部重跑，真实娃娃入暗室返回、背包取消/确认、照片墙、设置、地图/满包/日记时序限定通过；真实GL八帧和节点轨迹另附。
- 边界：后半照片/旅行已mount，日记为暖路径；旧三路冷日记只按未变身份引用。原生输入注入与llvmpipe图不替代Web/设备/用户观感。

以后凡使用SubViewport控件坐标的QA，必须先反算生产命中目标，不能仅凭最后关闭状态把外点误取消记为按钮通过。不要调整生产代码或固定帧率来迎合夹具。
