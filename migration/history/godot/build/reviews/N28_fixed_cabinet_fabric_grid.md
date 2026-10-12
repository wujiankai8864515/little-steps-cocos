# N28 柜体稳定、挂布曲面风动与局部点击反馈

用户反馈整柜shake、挂布风动太弱。确证：Home衣柜使用公共入口bounce，缩放整个Wardrobe；衣柜挂布为Sprite2D四角quad，shader即使使用正弦仍只移动四角，7源像素经缩放约2px，不能形成中部曲面。

修复：仅Home衣柜入口选择不动画的捕获释放路径，其他入口默认保留现有feedback与取消/位移阈值。内衣布保源atlas与原尺寸，四个(衣/影)6x14网格、每个105顶点，让shader固定上缘、曲面与下摆柔弯；双正弦错相34源像素约13屏幕像素上限。衣布点击添加独立阻尼spring，影共用同motion/click_bend，既不动柜体也不靠整张transform摆动。关闭清空spring。

预算：不新增纹理/字体/租约或ShaderMaterial，4个Polygon2D合计420顶点/336四边形，保现有1MiB节点材质预留及12MiB viewport预留，非实测Web内存声明。

官方Godot4.5.2三脚本编译overlay+197ee6c正式PCK资源候选，独立HOME/XDG，真实App入口、真实根点桃花/返回。38断言0失败0运行错误；12帧柜体transform相同、网格105点、真实click脉冲非零、影相同、原始资源租约有效。亲看3帧cloth_frame_*.png，上缘稳、下摆非刚体曲弯、两件错相，牌签保持固定。

证据round7_wardrobe_cloth_verified_candidate。初次并行export被系统Killed，未改源/门禁去掩盖；自动串联缺overlay的无效测试不计成功。降低并发后官方导出和单次GL成功。尚非新正式包/Web触摸/硬件GPU验收。
