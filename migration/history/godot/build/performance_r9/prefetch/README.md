# R9-L03：Home资源预取不再等Comic下载回调

仅移除App._prepare_home在Home必要PCK挂载之后等待comic_batch创建的循环。Home预取调用时点仍是Login真实就绪之后；资源清单、全部容量上限和帧预算不变，不预取任何可选页。

- baseline夹具明确复现：Comic尚下载时，Home已挂载但home_batch仍null。
- candidate在同一条件立即把Home68项必要资源交给门禁，current_page仍LOGIN、Home仍不可交互。
- generation检查仍紧跟Home ensure_group：旧代际的挂载完成不入队；重复调用只创建一批；关闭后迟到批次不变ready、不污染新Home错误。
- 实际资源组Comic priority85、Home60均predicted。专门队列测试先启动Home0，再加入Comic，下一启动必须Comic0，之后两批完整成功。
- 77条App闭包/状态断言（其中68条逐资源优先级检查）通过；49条scheduler断言通过。不同断言数量不是性能完成主题数。

测试test_home_prefetch.gd使用显式App源路径，唯一覆写_ready/_process避免完整场景构造；真实_prepare_home/_resource_specs保留，pack/gate为可控桩。源代码分支/优先级证据不能替代正式包慢网、首帧卡顿与实际页面绘制回归。
