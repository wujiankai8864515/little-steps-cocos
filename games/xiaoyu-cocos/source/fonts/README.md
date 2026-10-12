# 字体来源与子集生成

本目录保存 LXGW WenKai、Noto CJK 和 Ma Shan Zheng 的固定源、许可证及清单。运行时使用 assets/bundles 中的字体子集和字形数据；完整源不放入 Cocos assets，不进入微信包。

LXGW WenKai 1.522 源 SHA256 为 39ad71264b588165b469e35e6afb162a378dacd1f95348160240ba9038ac3009。版本、许可和基线来自固定历史源，迁移前后字节一致。licenses/fonts 保留发布许可，本目录保留作者来源。

共享 UI 和 Loading 的字形工具分别为 migration/tools/prepare_haptic_font.py、prepare_startup_assets.py，固定 fontTools 4.61.1。新增文本检查字形覆盖、轮廓及指标，并生成新验证记录；不依赖已删除的相邻工程或系统 fallback。

Loading 字体只覆盖首屏状态和重试文本，与共享 UI 字体分开。工具会写资产与记录，只在对应文本改动时执行，普通打包不重复生成字体。
