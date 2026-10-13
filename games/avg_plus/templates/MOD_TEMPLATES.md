# 两种 Mod 模板

## 纯配置能力

复用 cinematic-style，在 effects 配置中为事件加入效果。默认文件已经提供淡入、移动、脉冲示例；不增加脚本工厂，不新增模块 ID。

## 带脚本能力

```ts
import type { Mod } from '../../foundation/Contracts'; // 按实际深度调整
export function createExample(config: { enabled: boolean }): Mod {
  return {
    manifest: { id: 'example', version: '1.0.0', apiVersion: 1, order: 200, requires: ['base-avg'] },
    initialState: { count: 0 },
    validate(states) {
      if (!Number.isSafeInteger(states.example.count) || states.example.count < 0) throw new Error('count 无效');
    },
    beforeCommit(ctx) {
      if (config.enabled && ctx.action.type === 'avg.choose') ctx.draft.example.count++;
      if (ctx.action.type === 'avg.restart') ctx.draft.example.count = 0;
    },
  };
}
```

实际包同时维护 manifest.json 与生成的 ModManifest.ts；从文件导入清单。逻辑示例参见 reward-variant、story-branch；异步表现示例参见 cinematic-style。纯配置扩展复用已有能力时，不需要为每种效果建立一个 Mod。
