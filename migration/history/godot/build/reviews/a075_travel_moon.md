# A075 旅行夜月位置与午夜投影复盘

## 触发与确证

基线源码 bc1f8cf，QA祖先0078c5a；官方4.5.2、精确九PCK、空res、真实App→Home→Travel bridge。共享Clock的seek_hour只用于确定性取帧。23点月(543,190)，direction=(0.702701,-0.711485)，人物影x=-10.540519；0点月仍不动，direction=(-0.534307,-0.845290)，影x=8.014606。Home的moon_phase为.375→.5，Travel仍用clamp后的sun phase，因此午夜日向量复位；固定月位置也漏接共享夜相位。真实GL红帧保存在build/travel_moon_review/baseline_gl，未被候选覆盖。

## 修复与边界

仅travel_scene_runtime.gd：读取原共享Clock的hour，以20→4连续夜相位计算左→右月弧；复用原moon配置控制横向范围和顶部高度，以原绘制圆/月缺绘制，无新资源。任何可见月光阶段都直接使用月方向，包括20.1和3.9的弱月。仅在19.5–20、4–4.5让人物地影的方向性偏移和旋角回到原点附近接触影再换源；夜间按月光权重恢复方向性，保留接触影。零光强时的单位方向不具有物理意义，不要求其连续；实际地影偏移、旋转后的轮廓、透明度必须连续。原太阳位置、色调、白天投影和beam不变。既有配置、路点、包、资源预算不变。

这是独立脚本候选覆盖PCK验证，不是新的正式发布包。GitHub同步、关联组同源正式打包、Web和用户视觉认可由后续组流程完成。未改变历史全表状态。

## QA误差保留

1. baseline_headless首次夹具使用weakref的Variant推断，项目将警告视为错误，脚本未执行产品场景。日志/summary原样保留。只把四处声明改为WeakRef，baseline_headless_v2重跑后正式红点复现。
2. candidate_headless初版用每0.01小时最大direction差<0.02作为“无跳变”条件；候选实际平滑交接的最大步差0.023448而报红。保留结果和原夹具。不放宽此常数作为通关手段；最终改用十倍细时间步的差量收敛，0.001小时最大差0.002345，约为粗步0.100015倍。正式基线真正的午夜跳变在细步下不收敛，baseline_headless_v3仍四项红。

3. 中间候选candidate_gl先修午夜/月弧，但用日/月方向混合，20.1和3.9在daylight已经0时仍产生反月地影，不满足弱月同源。旧图、编译PCK、源码、运行结果全部保留。新增严格判据后intermediate_headless_strict确实红在弱月同源项；最终candidate_v2直接使用月方向，并在边界将人物影偏移/旋角淡成接触影。最终实测20.1偏移x=+0.272405、3.9偏移x=-0.272405，与月的相反方向一致。
4. 一次baseline_headless_final运行误传空--overlay，被Path解析为当前目录；mount失败后夹具仍按候选运行，读取不存在月相字段报错。保留日志/command，随后通过原执行会话Ctrl-C退出130；跨命令PID不可见时未冒险发送信号。正确省略--overlay重跑baseline_headless_final_v2，正式基线六项红。runner新增输入PCK存在校验与异常子进程回收。

## 有限回归

最终candidate_v2_gl真实GL实页：23/23.99/0/0.01/3夜帧，19.9/20.1/20.5和3.5/3.9/4.1边界；共享对象身份和Home夜相位一致；背景冻结、恢复跳过大首帧、退出scene/player/PCM弱引用释放、三次重开关闭。5/8/12/18/18.5原生GL帧在两次独立GL运行中的原始RGBA8数据SHA-256与同包基线逐一相同（每帧720×1280、3,686,400字节；JPEG仅展示），sun/tint/daylight/solar/direction/actor_shadow_offset完全相同。

所有图为原生Mesa llvmpipe，不推断Web、手机GPU、60fps或整场美术认可。

最终投影连续性实测：时间步0.01→0.001小时，椭圆轮廓最大位移0.425292→0.042539像素，中心位移0.298141→0.029826像素，透明度差0.000674978→0.000067500。整夜扫样无反月影。

5. 最初昼间比较使用JPEG解码像素，不能证明原始RGBA相同。已明确更正该两份JSON的method，另用raw_day_baseline_gl与raw_day_candidate_v2_gl两次真实GL运行补采Image.get_data()，编码JPEG之前记录RGBA8字节SHA-256。五时段3,686,400字节哈希逐一相同；证据和源码身份见raw_rgba_daytime_comparison.json，JPEG只供查看。


## 关联组打包前字体覆盖记录修正

源准备时，四份全局字体check通过，专用毛笔字体输出字节也与现有一致，但其coverage.json记录的travel_scene_runtime.gd corpus SHA仍为旧值，--check明确拒绝覆盖报告过期。不能跳过此门禁。

仅重新运行固定源/固定fontTools的子集生成器并提交coverage.json的新源码SHA；604字形、368512字节、字体SHA18864febf7fc7acf5a485ba7885cc8cd5d85ad7a2374e5ef8556316b72232933完全不变，glyph列表和资源契约也不变。正式包必须使用包含该记录的后续固定commit。

资源契约首次外部准备脚本误将refresh_contract返回的(config,audit)当config比较，属于准备脚本错误；正确解包后实际config逐字结构一致，128项/268344204B声明保持。以后复用该API须按返回签名读取，不将夹具断言红计为产品缺陷。
