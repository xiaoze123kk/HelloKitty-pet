# KittyPet Expression Pack 1

首批静态表情 PNG 概念稿：

- `surprised.png`
- `curious.png`
- `blush.png`
- `sleepy_soft.png`

运行时将表情作为现有 motion 的静态基帧覆盖，不改变状态机时序、动作关键帧、配饰层或特效层：

| 表情 | 触发 motion |
|---|---|
| `surprised` | `startle`、`noseBoop` |
| `curious` | `look`、`peek`、`edgePeek` |
| `blush` | `headpat`、`cheekTouch`、`petted` |
| `sleepy_soft` | `sleepy`、`moonGreeting` |

映射的唯一真源位于 `src/pet/expressionAssets.ts`。
