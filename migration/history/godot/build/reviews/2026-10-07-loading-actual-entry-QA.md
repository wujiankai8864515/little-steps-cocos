# 加载组真实入口补充验证（纯QA，非修复）

代码提交864065c、132b93f、字体资源ae4c692。空res、正式7ba4243 core和真实分包，由官方4.5.2/Mesa GL运行生产App/router/pack backend。明确仅本组候选delta：暗室12项（六源码+同名remap）；后测照片/日记/地图14项（再加bootstrap官方import/fontdata）。未复制全工程、未生成正式发布包。

暗室25项通过：真实布偶手势、确认、三相慢载、实际缺包失败/重试、真实取消按钮、迟到PCK SHA/挂载仅完成预热不跳页、warm无加载闪现、首帧ready。实际检查慢载/失败图，保留小区域截图；原图在/tmp/r7_loading/actual_darkroom，未复制大图入Git。

照片/旅行16项通过：App真实冷Home后photo on-demand；失败提示对象、retry、取消后late pack不打开覆盖层、warm照片页真实创建；日记请求travel包、进度不换对象、取消late完成不打开、warm地图真实打开。该组调用生产桥入口及取消/选择回调，不冒充照片/地图全套pointer验收；实际PCK请求/挂载留在results和transport中。五旅行模式逐个失败/重试仍有此前50项桥组件测试补充。

全部最终日志无SCRIPT ERROR或ERROR。复用历史harness输出中的scope原是c242旧固定说明，现保留为inherited_harness_scope，当前scope明确本轮真实候选身份，防止冒称零overlay或旧包。首次非隔离路径及异名remap装配失败已在N01复盘，本轮无产品新增失败。

字体独立红绿与32项GL完成；四字体总字节相较基线变小，不表示正式Home冷下载预算自动通过。整合后仍须全语料字体检查/官方导入、资源清单、19MB预算/128项/256MiB准入、GitHub同源、正式包与Web门禁。N17不改。
