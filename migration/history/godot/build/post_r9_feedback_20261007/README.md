# 整合复现工具

ACCEPTANCE.md 与 requirements.json 定义新五项范围和候选来源。工具默认工作树相邻有已验证的 Godot 4.5.2 toolchain 与保留的 R9 冻结包；pack/output 参数必须显式指定。构建工具拒绝 dirty 源、错误引擎/模板、缺失的私有远端全树验证收据以及已存在的输出目录。

- build_after_gate.py：在所有独立源提交及元数据推送/远端验证之后，从当前同一冻结源一次官方 native/Web 构建。正式输出仍需后续验收，构建成功不自动发布。
- run_new_formal.py：N1/N3/N4/N5 的零覆盖正式包夹具执行器，记录实际十一份PCK、递归外部GD、空res与运行前后哈希。N2使用 build/encounter_result_backplate/run_review.py。
- run_lifecycle_v2.py 与 lifecycle_v2.gd：同一夹具分别跑R9与新正式包。保留原版exact-count红证据；新版本只对合同上不应变化的资源/门禁池及最后清理断言，完整记录自然功德/花朵、对象/节点/RSS并调查无法解释的增长。不清缓存、不改变正式产品计时，不将诊断记录本身包装为内存全面通过。

所有实际运行命令、输出、失败、截图和原始计时需随最终交付保存。原生软件GL不等于浏览器硬件GPU或手机体验；等待用户的最终视觉认可。
