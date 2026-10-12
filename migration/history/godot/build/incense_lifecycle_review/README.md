# 香炉燃香有限核查材料

这是 A019/A020/A042/A045 的 e394 正式包核查提交，不是4项生产修复。测试对正式9PCK零overlay，不编辑产品源码、配置、PNG或字体。

先看 [REPORT.md](REPORT.md) 与 [verdict.json](verdict.json)。111条有限原生检查通过；Web localStorage真刷新、用户设备和用户视觉认可仍未验。

## 范围与证据

- `source_and_pack_identity.json`：e394源码、正式构建source_files逐文件一致；9PCK核查前后bytes/SHA完全相同；相关13个源文件也与接入材料时的6101141候选一致。
- `resource_audit.json`：实际PCK目录/bytes核验的34个相关资源成员。
- `evidence/`：完整关键运行日志、实际命令、结果、种子、PID清理记录、14张精选JPEG；不带PCK、全源副本或运行缓存。
- `image_index.json`：外部完整QA的45张JPEG索引、bytes、SHA，以及是否纳入提交。未精选图片仍保留在外部QA。
- `fixtures/check_fixture_v1.gd`：灯初态/错误ROI夹具原文，与原run hash一致。e394_v2精度夹具红用当前check.gd可重现；两次红的原因与更正在 fixture_correction.json，不能算产品缺陷。
- `matrix_evidence_proposal.json`：四条schema2当前状态及原始sources副本，只建议追加有限原生证据；未修改历史矩阵或Web/用户状态。

## 重跑

从空目录运行三个独立阶段。每阶段自己启动唯一Xorg、记录PID，并在退出时仅清理本人进程；同时只能有一个GL验证窗口。输出目录必须不存在或为空。

```sh
python3 build/incense_lifecycle_review/run_review.py \
  --stage lifecycle \
  --engine /path/to/Godot_v4.5.2-stable_linux.x86_64 \
  --packs /path/to/exact/native_packs \
  --pack-label exact-source-commit \
  --output /path/to/new-empty-lifecycle
```

将stage分别改成 `restore`、`light`，并为每阶段指定新的输出目录。restore阶段顺序执行真实点香seed、同slot新进程恢复、原deadline到期后第三进程恢复。不能单独跳过seed；full_precision种子保证严格身份比较没有浮点文本截断误差。

`check.gd`、`check_restore.gd`、`check_light.gd`均保留实际通过场景的原始字节；run_review.py仅将已用的三个Python启动器合并为参数入口，场景hash记录在runner_provenance.json。归档原始命令的--script路径指向当时外部QA，可用此入口在当前目录重播。

本提交接入6101141之后，但所有渲染证据仍只属于 e394 正式9包。A004的控制器影高度改动不等于香组新包验证；后续关联正式包需要按最小受影响路径再核冷Home、香炉/香接地投影及真实敲击奖励，不能直接继承本报告的包身份。
