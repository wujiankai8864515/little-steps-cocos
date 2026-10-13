# 卡牌玩法 UI、状态与单向数据流

完整执行协议和异步边界见 [Mod 架构](docs/MOD_ARCHITECTURE.md)。本文保留卡牌页面的挂点与规则说明；这些组件是基础卡牌 Mod 内部实现，不逐一注册成 Mod。

## 组件边界

本玩法共有 **14 个有状态 UI 组件**。`RewardProgress` 内部还有 4 个重复的无状态 `ProgressItem` 实例；纯背景、描边、图标、文字等装饰节点不单独计为业务组件。

组件之间不允许调用、广播或读取彼此状态。唯一合法链路是：

```text
玩家输入 -> GamePageUI -> Runtime.dispatch(card.*)
        -> Mod.beforeAction -> CardMod.execute -> Mod.beforeCommit
        -> 校验所有模块状态 -> 原子提交
        -> Mod.afterCommit -> 顺序/显式并行的表现任务
        -> Mod.afterRender -> buildGamePageViewState -> 刷新画面
```

## 组件映射（14 个）

| # | 组件枚举 | prefab / 运行时节点 | 责任 | 只读数据 | 可发 Action | 更新时机 |
|---:|---|---|---|---|---|---|
| 1 | `Board` | `content` | 显示桌面牌阵、暴露/翻面/可点状态 | `boardCards` | `PlayBoardCard(slotId)` | 开局、出牌、回撤、重开 |
| 2 | `CurrentCard` | `current` | 显示当前基准牌或已准备的万能牌 | `currentCardName` | 无 | 出牌、补牌、万能牌开/关、回撤 |
| 3 | `StockPile` | `backup` | 显示剩余备用牌与点击状态 | `stockRemainingCount`、`controls.stockEnabled` | `DrawStock` | 补牌、付费加牌、回撤、重开 |
| 4 | `RewardProgress` | `progress` | 显示四连击进度；空/红/黑三态 | `progressCells[4]` | 无 | 命中、奖励结算、回撤、重开 |
| 5 | `CoinWallet` | `coin` | 显示金币余额 | `coins` | 无 | 奖励、万能牌消费、加牌消费、回撤、重开 |
| 6 | `PauseControl` | `pause` | 暂停/继续入口 | `controls.pauseEnabled` | `TogglePause` | 暂停切换、完成、动画锁 |
| 7 | `RollbackControl` | `rollback` | 回撤最近一次已提交动作 | 可见/可用、`actionCosts.rollback` | `Rollback` | 历史栈、消费次数、暂停/完成状态变化 |
| 8 | `WildControl` | `wild` | 准备/取消万能牌 | 可见/可用、`actionCosts.wild` | `ToggleWild` | 准备、取消、使用、回撤、完成 |
| 9 | `AddBackupControl` | `addBackup` | 备用牌耗尽后付费增加 5 张 | 可见/可用、`actionCosts.addBackup` | `AddBackup` | 牌堆耗尽、加牌、回撤 |
| 10 | `RetryControl` | `retry` | 重开本关 | `controls.retryVisible` | `Retry` | 免费 10 张备用牌用完后出现 |
| 11 | `EndControl` | `end` | 离开本关 | `controls.endVisible` | `Exit` | 免费 10 张备用牌用完后出现 |
| 12 | `StatusMessage` | `gameStatus`（运行时） | 完成、暂停、无牌可走、万能牌提示 | `statusMessage` | 无 | 每次 ViewState 投影 |
| 13 | `Toast` | `toast`（运行时） | 金币不足、奖励、故障恢复等一次性反馈 | 单次 Effect 参数 | 无 | 对应 Effect 发生时 |
| 14 | `InputBlocker` | `inputBlocker`（运行时） | 动画期间阻止重复输入 | `inputLocked` | 无 | 每次动作开始/结束 |

`ProgressItem` 是 `RewardProgress` 的内部纯展示单体，共 4 个实例。它只接收 `ProgressCellState.Empty / Red / Black`，不读取牌、金币或兄弟 Item。

## 状态所有权

| 数据 | 唯一所有者 | 是否进入玩家回撤快照 | 说明 |
|---|---|---:|---|
| 桌面牌位、当前牌、备用牌、废牌、剩余牌池、完成态 | `HighLowSolitaireCore` | 是 | 纯规则层，不依赖 Cocos 节点或 UI |
| 金币 | `GameSessionStore` | 是（按被撤动作的金币净变化反转） | 回撤本身的费用不返还 |
| 四连击颜色序列 | `GameSessionStore` | 是 | 补备用牌不会清空；第 4 次奖励后开启下一轮 |
| 免费备用牌使用数 | `GameSessionStore` | 是 | 仅成功抽备用牌时变化 |
| 万能牌准备态 | `GameSessionStore` | 是 | 回撤万能出牌后可精确恢复 |
| 回撤使用次数、万能牌使用次数 | `GameSessionStore` | **否**（玩家回撤时保留） | 反滥用计数，防止回撤绕过递增成本 |
| 回撤历史栈 | `Runtime` | 不适用 | 同时保存所有 Mod 的前后状态；回撤动作本身不压栈 |
| 暂停 | `base-card` 状态 | 是 | 由 card.pause 动作变更 |
| 输入锁、渲染版本 | `GamePageUI` | 否 | 输入锁对应 Runtime 的忙碌状态；渲染代次拒绝迟到结果 |
| 节点可见、按钮可点、提示文案 | `GamePageViewState` | 否 | 全部由规则状态投影生成，不可反向写 Store |

## 动作与数据更新规则

| Action | 前置校验 | 原子状态变化 | 连击影响 | Effect |
|---|---|---|---|---|
| `PlayBoardCard` | 未暂停/未锁定、牌已翻开且无遮挡、点数相邻；万能牌时还要金币足够 | Core 移牌；记录颜色；万能牌成功使用才扣费；第 4 次结算奖励；压入回撤快照 | `+1`，不重算旧进度 | 弧线飞牌、落点缓冲、翻开/阻挡提示、进度爆点、奖励飞金币 |
| `DrawStock` | 未暂停/未锁定、未准备万能牌、牌堆非空 | 替换当前牌；免费牌计数 `+1`；压入回撤快照 | **保持不变** | 半程翻面并飞到当前牌 |
| `Rollback` | 有历史、金币足够 | Core 与可回撤 Session 状态一起恢复；反转被撤动作金币差；扣当次回撤费；回撤次数 `+1`；历史弹栈 | 精确恢复快照 | 当前牌先换成恢复结果，再播放逆向飞牌；进度差异弹跳 |
| `ToggleWild` | 未暂停/未锁定、未完成；准备时金币足够 | 只切换准备态；此时不扣费 | 不变 | 万能牌飞入/当前牌翻回 |
| `AddBackup` | 备用牌为空、未准备万能牌、金币足够 | 增加 5 张；成功后扣固定费用；压入回撤快照 | 保持不变 | 多张牌依次飞入牌堆 |
| `Retry` | 未锁定 | 新建 Core、重置 Session 与历史 | 清空 | Button 自带按压反馈，重新发牌 |
| `TogglePause` | 未锁定、未完成 | 切换暂停态 | 不变 | Button 自带按压反馈、状态文案变化 |
| `Exit` | 未锁定 | 解除回调并由外层切页 | 不变 | Button 自带按压反馈、下一帧切页 |

## 费用规则

- 回撤：第 1 次 100，第 2 次 200，第 3 次 300，依次递增。
- 万能牌：第 1 次成功使用 100，第 2 次 200，第 3 次 300，依次递增。仅“准备后成功出牌”算一次；取消准备不收费。
- 补充备用牌：每次 100（当前需求未要求递增）。
- 玩家回撤不会降低回撤/万能牌使用次数；只有明确的 `Retry` 开新局才归零。

## 正向提交、负向回退与故障恢复

1. Runtime 深拷贝所有 Mod 的已提交状态，作为本次候选事务。
2. 规则变更完成后同时校验牌唯一性、遮挡关系、当前牌、金币、连击长度和计数范围。
3. 任一规则写入或校验抛错，丢弃整个候选事务；已提交状态与历史不变。
4. 提交成功后才播放动画。动画失败不篡改已提交规则；临时飞牌节点会被清理，并从最新 ViewState 重建画面。
5. 动画期间 `InputBlocker` 全屏拦截输入，防止双击、并发补牌、重复扣费或回撤栈竞态。
6. 异步牌面加载带渲染版本校验；旧请求不能覆盖新状态，失败缓存会清除以允许重试。

## 代码入口

- 枚举、组件清单、ViewState 与唯一投影函数：`assets/mods/base-card/GameUIContract.ts`
- 局内状态、奖励和费用规则：`assets/mods/base-card/GameSessionStore.ts`
- 输入与 Cocos 会话适配：`assets/mods/base-card/GamePageUI.ts`
- 基础玩法 Mod：`assets/mods/base-card/CardMod.ts`
- 画面与基础动画：`assets/mods/base-card/GamePresentation.ts`
- 原子事务、执行顺序和异步任务：`assets/foundation/Runtime.ts`
- 纯牌局规则、快照和不变量：`assets/mods/base-card/HighLowSolitaireCore.ts`
