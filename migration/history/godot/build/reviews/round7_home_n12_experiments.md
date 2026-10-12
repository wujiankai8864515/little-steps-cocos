# N12 诊断试验复盘

1. 初次解码用默认HOME，Godot尝试不可写user目录导致signal11；改独立HOME/XDG目录后正常解码，非产品故障。后续全部隔离目录。
2. 首次alpha加权shader helper直接访问TEXTURE，GLES编译失败；Godot builtin限fragment作用域，helper需sampler参数。修正后真实GL通过，但A/B仅≤10/255且改善不足，否定其为充分根因，未提交为修复。
3. 最终用覆盖内亮金下限移除位图已有棕暗rim，保alpha/字形。实际候选PCK昼夜/12数值A/B无shader/resource错误。正式包与Web未验证。
