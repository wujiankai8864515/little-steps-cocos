# N01 加载对象文案候选
根因：旅行桥将 comic/journal/archive/collection 的初始、进度、失败提示全部硬编码为旅行画卷；照片、暗室独立文案不一致。统一使用已驻留 Speech 的对象映射，进度仅更新进度条，失败包含对象和重试。

证据：test_caption_contract.py 五项先红后绿。正式7ba4243 core及实际分包 + 12项明确候选源码/remap小delta；官方4.5.2运行test_loading.gd，30项通过。逐个comic/map/journal/archive/collection真实open_page方法检验初始、进度、取消后晚回调、失败、重试；App/Home/Photo脚本可实例化。此为生产桥组件入口注入loader测试，不冒充真实网络或Web验收。

未改资源准入、旅行计时/终点结算、包请求、代际判断。N02动态点/定宽及多屏画面另行验证。正式构建/远端/部署未做。

测试工具曾因未隔离XDG目录崩溃，改为/tmp/r7_loading隔离HOME/XDG；候选异名raw remap导致继承解析失败，改为原res路径+同名remap覆盖后通过。均属QA装配失败，不是产品根因；最终日志无SCRIPT ERROR。
