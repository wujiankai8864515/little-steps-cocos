# R9-L04 宿主准备串行等待复盘

## 根因

宿主run在actor.start及两次paint之前不发起manifest/engineJS网络请求，三张顺序图片decode的时段网络空闲。它们没有数据依赖。

## 修复

actorReady任务与原manifest/engineJS串行链重叠，立即观察actor失败。引擎heavy start仍await actorReady，保原paint机会；取消/失败仍走既有fail停止动画、abort下载、关闭transport及防止迟到启动。没有开启图片并行解码或下载可选页面。

## 验证

host_overlap目录固定before/after事件顺序，3个并行/失败/关闭场景通过；ready-driven四场景重跑通过，node语法检查通过。新顺序actor_start→manifest→engine_script→actor_ready→engine_start；旧顺序actor_ready早于manifest。

## 未验

未生成新的正式Web包，无真实浏览器网络、CPU争用、内存峰值证据。engineJS较早准备的CPU可能与图片decode重叠，需浏览器全链profile；官方WASM/core大阶段仍在actor完成后，保持首屏动效不被刻意跳过。
