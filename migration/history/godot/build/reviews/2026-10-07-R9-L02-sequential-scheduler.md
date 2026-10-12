# R9-L02 顺序资源调度复盘

## 根因与实证

Godot4.5.2 non-thread官方后端start已同步load，gate把完成项留到下一_process才consume，因effective concurrency=1而阻塞后续启动。68项tiny真实Resource不论start上限1或8都69ticks，验证不是网络/GPU原因。

## 修复

仅对非线程后端，在剩余时间和finish额度内同帧consume，循环再启动下一件；耗尽预算不继续工作，也不追加末尾完成回调。App操作cap8，2ms准入预算与80/128/256MiB容量不变。线程后端保留原有完成轮询流程。

## 回归

build/performance_r9/scheduler保存46条失败/取消/迟到/代际/重入/去重/准入回归与真实Resource前后数据。候选68项9ticks。实际6327PCK+显式sourceApp/gate候选LOGIN606ms、四项入口检查通过、13项资源各加载一次。真实decode最大调度22.598ms仍超预算，准确保留边界。

## 夹具失败/调整

直接把候选全局类从另一路径加载会被Godot拒绝“hides a global script class”；确证与正式包缓存同名类冲突，测试专用副本仅把class_name改为TravelBudgetedResourceGateR9QA，原源未动且逐字节核验除了该行完全一致。候选路径通过命令参数显式传入，没有隐藏候选包/覆层，也不作正式验收结论。

## 风险及未验

单资源同步decode和完成信号下游构造不可被2ms打断。必须在关联组同源正式包重跑冷入口、反复打开/返回/取消、8场景，核draw/material/输入与Web网络；不可用tiny基准或headless替代。此提交不改路由过渡/演出时长，不改变资源列表与包体。
