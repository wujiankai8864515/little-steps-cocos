# R9 TravelPage 按实际页面消费资源候选

依赖：关联组 page_resource_sets.gd 单一资源清单及 App/TravelBridge 按mode准入改动，由loading关联提交提供；本提交不能独立替代完整关联组。

根因：原 _load_page_assets 在任意旅行派生页首次进入时一次读入地图、整页日记、NPC等全部纹理，之后以_font非空跳过所有准备。这样收藏不必要解码地图/人物，按需升级页面时又不能补齐资源。

修复：先规范化目标页语义，再按共享清单对各字段独立惰性准备；公共已有资源身份保留。原未消费的_map/_npc变量不再触发load。归档入口先发navigation_requested("archive")，保留当前collection，资源准入成功由owner切换；journal_id与collection_index跨归档/返回保留。取消和迟到回调归owner的代际门禁。

12项候选组件检查通过：构造不读图；collection资源具备且map/NPC/日记大图/sceneatlas不入cache；暖进archive只补所需且公共对象身份不变；event别名一致；真实已完成旅行产生归档fixture，点击发owner请求且不提前替换gallery，完成后保journal/选态，Back保持原公共资源。无ERROR或ObjectDB泄漏。证据build/performance_r9/runtime/mode_page/。

没有更改图片、文字、布局、包拓扑或动画。完整App/Bridge按需/取消/重试/late以及正式分包/nativeGL验证由关联组统测，此处不冒称已经全部通过。
