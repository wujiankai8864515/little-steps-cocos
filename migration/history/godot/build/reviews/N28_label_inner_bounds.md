# N28 衣柜牌签文字越边

已实际查看用户反馈原皮·已穿上右侧挤边截图。根因：Label的文字minimum size可把显式size撑大，23px固定字号也未对动态“已穿上”后缀测量。原边距仅6px。

修复：牌签内区固定左右12px/上下7px，clip_text关闭minimum-width扩张；按真实Font.get_string_size共同测量两牌取可容纳字号，不靠裁字或逐文案offset。标题保既有居中。无新增字、字体或图片。

候选：官方4.5.2编译单page overlay+197ee6c正式全部资源，真实App/根鼠标进衣柜，两牌测量均落固定134px内区，桃花真点击/宽屏/返回亦通过。22条断言、0运行错误，已查看真实original_wardrobe.png。证据round7_wardrobe_label_candidate；正式重包/Web仍待验，不能把字体测量单独视为视觉通过。
