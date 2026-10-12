# 五项关联组冻结前元数据检查

## 触发条件和已观测失败

五个独立修复均已私有 GitHub 推送并远端字节读回后，整合源 `11fefad0c56f924fc26924f91b906c38b7ba2804` 上运行：

`python3 build/fonts/travel_brush/prepare_travel_brush.py games/travel_woodfish/project --output games/travel_woodfish/project/travel/assets/travel_brush.ttf --check`

工具在第54行按既有硬门槛拒绝：`AssertionError: Travel brush coverage stale; regenerate before building`。正式 native/Web 构建尚未启动，未发布失败输入。

## 确证根因与修正

coverage.json 按路径及源码 SHA 固定 Travel 文字语料。新 `travel_atmosphere.gd` 和更改后的 `travel_page.gd`、`travel_scene_runtime.gd` 使语料清单/哈希发生变化，而可见中文字符集合不变。用固定 FontTools 4.61.1 和固定官方 OFL 原字源重新离线生成后，只有 coverage.json 的路径和源码哈希改变；源字体、许可证、glyph文本和运行字体字节未改。

- 前后运行字体：363236 bytes、597 glyphs、SHA256 `e575cf498f871802a2d59f1f696a97a4858b3940a552d47b161afbebadf4b7c0`。
- 旧 coverage SHA256 `01482a3d97d53db9cfa03dc9f83773e6cbcea4d4a9c2450dfe4f8922d0cae32e`。
- 新 coverage SHA256 `a2a202ff5ace933690a53de4bce5f591a7414b8b72d811bce22995fd3e8aa2a1`。
- 四个通用字体子集检查通过：745码点、144语料文件、零缺字。
- resource_pipeline --refresh-contract 通过，未再修改资源分组；物理PCK总数仍由正式生成清单确定。

此修正属于可复现构建元数据，不是新增视觉修复。再次字体check、源码闭包、远端验证后才正式构建。旧失败不被后续成功抹掉。

## 源备份过程的非产品事件

首次 C01 cherry-pick 因当前机器没有默认提交者身份中止；显式使用此前同一Codex提交者后继续原cherry-pick，未更改全局Git配置。N5 push 已完成后，收取子进程输出的工具请求被取消；先独立读回远端main确认已是11fefad，没有重复push，再安全重跑只读完整tree/blob验证，结果通过。上述都未改变产品功能或触发发布。
