# R9-A01 页面状态单向与公共退出生命周期

## 问题和真实改动
照片桥直接读取兄弟 Travel/Wardrobe 桥的内部模型；照片和衣柜各自复制了 Home 输入、world process、SubViewport、SafeUI、knock 的进入/退出序列。重复恢复把状态写死为 INHERIT/ALWAYS/visible=true，没有保存进入前的状态。

Home 现为组合入口，注入库存服务、服装存储与一个共享 fullscreen overlay port。照片只接收源模型变更，不再访问 home.travel/home.wardrobe。port 用弱 owner 和独占 acquire/release 保存并恢复原值；错代/重复关闭不能恢复另一页面持有的 Home。释放后按当前应用焦点决定 knock，bridge 销毁也释放自身租约。Travel 的复合背景策略未混入照片/衣柜的 fullscreen 策略。

## 验证
- 官方 Godot 4.5.2，16 项端口单元检查，正确XDG环境重跑无警告/错误。
- 精确6327bdb正式 core + 原动态分包 + 显式代码 candidate overlay：实际启动/Comic/Home，照片衣柜各3轮打开关闭，Home暂停/恢复，26项通过、销毁后0 orphan。该证据是候选运行，不冒充同源最终PCK验证。
- 资源合同新增唯一脚本，无新增图片、纹理、声音、字体；原80/128/256MiB硬限不改。该项为架构/生命周期正确性改进，不单独声称帧率或加载速度收益。

## 首次测试设置失败
最初小单元fixture只设置XDG_DATA_HOME，未设置XDG_CONFIG_HOME/CACHE_HOME，导致引擎设置路径错误；末尾临时Node未free导致fixture退出提示。已保留原始失败日志在performance_r9_baseline/overlay_test/run.log，修复隔离环境与fixture后26/16检查按各自范围通过，未用环境失败解释产品问题。

## 未验边界
最终新源码PCK的渲染、完整输入/焦点回归及Web仍须本组后续验证，不因单元/candidate通过直接标为最终通过。
