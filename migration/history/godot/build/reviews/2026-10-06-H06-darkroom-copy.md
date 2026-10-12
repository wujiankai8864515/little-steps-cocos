# H06 / A046 暗室等待文案

来源：Sentinel_7379ac04ce048191811711138fa96db7。用户只需“暗室装载中…”并循环点，不显示bytes或技术阶段。

根因：App._darkroom_wait_text把download/resources/first_draw等内部状态拼成两行，并将字节或资源数量直接呈现。

修复：只返回“暗室装载中”加1至3点，520ms一相。App仅在DARK_ENTERING且loading时刷新，公共气泡相同文本不重新布局；下载回调未变化时点也能循环。内部darkroom_progress的stage、计数、timing、error及startup_metrics全部保留，不改加载/取消/重试逻辑。

验证：官方4.5.2/Mesa实际Home等待与错误重试图已查看；21项检查覆盖四内部阶段的简洁文案/诊断保留、实际鼠标取消与重试各一次、无网络回调时省略号变化且气泡不改变尺寸。没有新贴图或字体。此组件验证不是整组冷分包/实际Web结果，正式冻结组仍需跑入口。
