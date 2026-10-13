# figma-importer(Figma → Cocos Creator 3.8 导入器扩展)

## 纲领文件(最高优先)

**移植与校对以这份指南为准**:`/Users/dengchg/tuyou/figma2cocos/figma2unity-v1.0.8/Figma→Unity 导入使用指南.md`

- 做任何功能前,先回到指南对应章节,再顺藤去 Unity 源码(`../../../../figma2unity-v1.0.8/UnityPlugin/FigmaImporter/`)找对应逻辑,最后移植到本扩展。
- **校对要对「效果」不只对「代码」**:不能只看"有没有对应函数",要对照 Figma/Unity 实际渲染找差距。用户观感基准是「Unity 比 Cocos 更像 Figma」,根因常藏在指南强调的细节里。
- 指南是功能完整度的权威清单;自拆的阶段方案(`~/.claude/plans/stateless-baking-gray.md`)降级为辅助参考。

## 架构铁律

- 建节点的引擎 API(`cc.*`)只能写在 `source/scene.ts`,主进程经 `execute-scene-script` 转发(见 main.ts `callScene`)。
- base64 图片绝不走 IPC:先在 main 落盘 `db://`(见 `assets.ts`),只把 uuid/路径传给 scene。
- 构建:`npx tsc`(source/ → dist/)。测试稿 `test-data/From-figma-打城提示优化3.json`。用 Cocos MCP 实时验证节点树与渲染。

## 三端外观签名必须一致

FigmaPlugin `buildTextSignature`(code.js) ≈ Unity `FigmaTextStyleTable.BuildSignature` ≈ Cocos `textstyle.ts buildTextSignature`。任何一端口径变了,字体样式匹配就全盘错位。
