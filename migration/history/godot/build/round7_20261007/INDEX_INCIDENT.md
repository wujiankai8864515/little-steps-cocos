# 准备工作树索引故障（非功能修复）

新--no-checkout工作树未seed index即设置稀疏路径，之后多命令串未set -e，AGENTS缺失失败后仍执行commit，误录基线删除。错误本地29b20a1已隔离refs/qa-rejected/empty-index-preparation，不推送/打包。原7ba源、Git及部署未变。

恢复固定7ba HEAD/index后checkout-index -a物化选中项，复核清单提交仅AGENTS/本批docs变化，无基线删除。后续shell set -e、显式固定commit、按完整tree/blob/mode比对和拒绝意外删除；此事故不算任何产品修复。
