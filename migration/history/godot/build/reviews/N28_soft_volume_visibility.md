# N28 衣柜窗光丁达尔可见性

用户实际反馈有影但丁达尔不可见。现有volume与背景共享单个极宽Gaussian，峰值alpha仅0.12/0.075，难从已有亮窗地板中辨出散射层；已有独立720x1280 SubViewport保证MODEL坐标，本项没有证据指向SCREEN_UV失配，因此不假称坐标修复。

修复：保真实左窗虚拟源、共享solar_phase/night，采用照片页同类多角度软锥方法，三组错开Gaussian扇束、距离衰减、入射渐入、地面渐隐、alpha上限0.34。保MODEL room-local位置，不使用屏幕UV/FRAGCOORD；画面尺寸或PageHost平移不改变光束构图。volume_gain默认1只给受控对照可关volume，不改背景受光/投影，不增texture/material/node。

候选：官方4.5.2三脚本overlay+197ee6c正式资源，真实App/根输入/衣柜返回/两贴图租约/网格点击/柜体12帧稳定38断言0失败，0运行错误。分别12/22点等待光照稳定后冻结页面处理，仅开关volume_gain捕捉同姿态on/off；亲看昼夜真图能见软窗光，角色与牌签仍清楚。720x1280全图on/off平均RGB绝对差5.095昼、3.027夜；变化>3的像素分别271080、237275，最大78/50。数值用于证明真正绘制，不替代视觉判断。

证据round7_wardrobe_light_candidate/volume_{12,22}_{on,off}.png、volume_pixels.json、original.json/log。属于原生Mesa候选，不代表正式包、Web硬件/手机触摸或用户视觉接受。未恢复太阳/月亮实体，没有新增资源预算。
