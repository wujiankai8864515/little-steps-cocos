# R9-L01 加载硬等待复盘

## 触发与根因

6327bdb在App和Web宿主各保留一处1000ms加载下限。登录资源/场景提前完成时仍等待，且两处必须一起去除。最新性能批次覆盖旧硬1秒要求。

## 实际改动

删除App MIN_LOADING_MSEC及while；删除宿主revealIfReady的1000ms while。诊断字段改为真实loading_visible_msec。pack/resource成功、场景真实ready、frame_post_draw、宿主engineStarted/gameReady/loginReady及两次paint条件保持。登录标题/副标题/停顿/探头、路由过渡、故事与游戏动效的时间未修改。

## 验证与证据

build/performance_r9/loading/记录原生baseline/candidate JSON和日志、模拟宿主before/after及可重复夹具。官方引擎SHA256为5803746bbe055bee0f07a3c5b0dd347719bd45599f3d34519a8a0beaf83014ae。实际core/entry包来自正式6327bdb，候选App显式单独加载；App从1443ms降至677ms到LOGIN，演出仍从TITLE开始，资源与节点ready保持。宿主慢加载/关闭迟到/下载不全均安全。

## 夹具失败与防复发

- 初次独立scheduler夹具只设HOME，Godot仍访问默认数据目录并崩溃。确证缺少XDG_DATA_HOME，补四个隔离路径后成功；不是游戏根因。
- 初次App夹具未把正式Web manifest显式设native，headless入口超时；与既有正式原生runner对齐后正常。
- 夹具到LOGIN立刻free时触发预取取消打印HOME_PACK_FAILED，发生在子节点先退出的夹具收尾阶段。夹具只在结果保存后设置_shutting_down再free，不以该处理冒充生产生命周期修复；后续生产关闭专项由独立项验证。

## 尚未验证

当前改动未生成正式新包，未做真实浏览器或用户设备GPU首帧/网络性能验收。不扩大下载范围，不改变美术/材质/动画/物理，也不移除必要draw就绪门禁。
