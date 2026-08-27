# personalization 私人内容目录

本目录**不进 git**（`.gitignore` 已排除）。它由 `npm run sync:personalization` 从
`personalization.example/` 补缺生成，之后请在这里改真实内容。日常使用也可以直接在 KittyPet
里打开“设置 → 相处资料”，不用手动编辑 JSON。

## profile.json

```json
{
  "nickname": "她对你的称呼",
  "yourNickname": "你对她的称呼"
}
```

## dates.json

```json
{
  "specialDates": [
    { "id": "first_meet", "month": 8, "day": 12, "label": "第一次见面的日子" },
    { "id": "birthday", "month": 11, "day": 1, "label": "你的生日" }
  ]
}
```

`month` / `day` 是自然月日。对白里可以用 `{{specialDateName}}` 引用当天命中的纪念日名称。

## dialogue.json

字段说明：

| 字段 | 说明 |
| --- | --- |
| id | 唯一字符串 |
| text | 正文，支持 `{{nickname}}` `{{yourNickname}}` `{{daysTogether}}` `{{specialDateName}}` |
| followUpText | 可选第二句话：第一句展示约 3 秒后接上，用于"停顿一下再补一句"的彩蛋 |
| emotion | neutral / happy / shy / sleepy / concerned（气泡配色） |
| motion | idle / wave / shy / sleep / happy（角色动作） |
| priority | 数字越大越优先；同优先级内按 weight 加权随机 |
| trigger.type | firstLaunch / timeRange / click / rapidClick / dragEnd / sessionDuration / specialDate / streak / random |
| trigger.rangeKey | morning / noon / night（仅 timeRange） |
| trigger.minClicks | 4 / 9 连击门槛（仅 rapidClick） |
| trigger.minutes | 运行时长门槛（仅 sessionDuration） |
| trigger.specialDateId | 绑定 dates.json 里的 id（仅 specialDate） |
| trigger.minStreak | 连续打开天数（仅 streak） |
| cooldownMinutes | 同一条两次展示的最小间隔（分钟） |
| dailyLimit | 每天最多展示次数 |
| weight | 随机权重，默认 1；稀有彩蛋建议 0.3–0.6 |
| onlyOnce | true = 一生只展示一次 |
| unlockDay | 从安装起第几天才可解锁（0 = 第一天） |
| tags | 备注用 |

写作建议：宁可少说，不要频繁说。一天主动 3–6 次 + 点击响应 + 极少量稀有彩蛋。
