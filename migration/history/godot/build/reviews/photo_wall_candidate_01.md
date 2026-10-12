# 照片墙候选01构建拒绝（2026-10-06）

触发：候选official export期间继续更新photo材质/纸框代码。
证据：/tmp/photo_wall_candidate_01 的导入、parse、Home真实input、App smoke通过；assemble末尾抛出 Production source changed during build。
确证根因：实施者同时修改生产源，违反稳定snapshot构建要求；非引擎或导入失败。
修复：该目录仅作诊断/迭代GL工程，不是可交付候选。阶段冻结后停止编辑、从独立不变snapshot重建；若继续迭代，只更新明确标记的诊断工程。
回归：最终assemble必须完整返回checks PASS，源码前后manifest相同；正式PCK仍等待远端源码核验。
边界：当前尚未正式PCK/Web验证。
