# R9-L03 必要资源预取串行耦合复盘

## 根因

两页PCK传输原本并行，但Home挂载成功后还等Comic下载并创建comic_batch，网络慢Comic使已到手Home资源无法解码，之后Home可能再集中等待。实际源码app.gd旧289–291行可复现。

## 改动与回归

去掉该无资源依赖的等待，保留挂载前/后generation与home_loading单飞、原资源列表和优先级。Home只利用Comic下载空档；Comic到达后按85>60优先级插队下一加载项。build/performance_r9/prefetch提供before/after、实际Home68项闭包检查、重复prepare、stale mount、latecancel与foregroundpriority断言。没有提前下载travel/photo/wardrobe/darkroom等可选页。

## 夹具失败及修正

初版给Array[String]字段赋无类型Array被Godot拒绝，改为typed_array.assign；该错误只在夹具赋值，未进入产品逻辑。保留停止失败进程并重跑通过，不冒称产品回归。

## 边界

77 App断言包含68条逐资源优先级，不按断言数量算完成工作。重构没有切分Home实例化/ready；单项同步decode及场景/材质首绘仍需完整正式包验证。取消不能重新打开Home，代际清理和既有首绘/路由保留。
