# A004 普通道具抬升影子复盘

## 触发、证据与根因

正式e394九包冷Home，root鼠标抓起碗/娃娃/凳子，指针上移35px再90px。生产world/grounding持续更新；只固定昼夜时刻和无关ambient审图，不冻结影子。道具始终发送lift=5，接触alpha=0.15416，接触点跟着物体上移。碗与凳子的GL对照明确可见。另一个显式helper-hidden诊断帧隐藏对应helper后该影消失，排除这块影烘在源图。鱼在原包中正确，未列为缺陷。

确证根因：interaction controller沿用视觉drag anchor作为caster floor，并把既有5px抓起间隙当作完整离地高度。不是透明输入层、素材烘影、绘制缓存或shader强度问题。

## 单项修复

仅改home/interaction/home_interaction_controller.gd，在给caster发布元数据时分离三道具的视觉anchor与projection anchor：上移时保留原地面、传实际升高量；下移时不会负高度；沿现有settle插值自动回零。不改视觉transform、鱼、最高层、饮水动作或shader。

## 回归与结果

build/home_grounding_review中同脚本实包RED有63项确证失败；官方编译仅替换controller.gdc的候选GREEN为255项0失败。实际组合/边界回归148项0失败，默认ambient饮水恢复与取消后敲击16项0失败。18个对应上举帧的原资源source_transform完全一致；43个离地settle样本临时Canvas都在；42张影子对照及3张组合图均逐张查看。

同组旧基线四次221个断言/34张GL图仍按A003/A004/A005/A013/A021有限范围保存，不用新的A004绿结论抹去旧缺陷或把其他主题自动改绿。

## 验证工具的小失败

首次单脚本编译器的依赖正则把.gdshader前缀误识别为.gd，读取不存在的文件后在正式编译前停止，没有生成或改原PCK。修正为匹配完整带引号的.gd路径，正式Godot导入/编译/组包无错误。基线首次脚本超时及review冻结误阻止敲击的夹具问题另见baseline/harness_review.json；未改生产迎合这些夹具。

## 尚未验证

本次只是一文件候选core，与八个原资源包组成测试输入。GitHub备份、关联组正式打包、部署及其精确正式包回归由主线程后续完成；尚未验证Web/用户硬件/声音/触感/60fps或取得用户视觉认可。
