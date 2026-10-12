# N10候选实帧失败复盘

触发：首轮整组候选真实PCK渲染，LivingVine Polygon2D以AtlasTexture配局部UV。
证据：round7_photo_group_v1/01_actual_two_photos.jpg，两侧显示整个素材母板缩影而非藤蔓；编译和结构断言未发现可见缺陷。
确证根因：Polygon2D绘制纹理底层atlas，局部UV未显式加atlas区域偏移，采样越出vine区域。不是导入像素或加载错误。
修复：Polygon2D显式绑定完整atlas并将每个mesh UV置region.position + q * region.size；无额外纹理或资源条目。
回归：重建官方GDC候选核心、仍加载同一无损photo.PCK，实际多帧截图检查藤蔓范围；新增UV全部落在指定region断言。
边界：v1失败未算N10通过，无正式部署；用户画风/Web验收另列。
