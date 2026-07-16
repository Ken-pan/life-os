# healthos-focus-agent — HealthOS Focus 本地代理

HealthOS Focus 模块(vibe coding 防沉迷)的检测与干预核心,由 vibeguard 迁移而来。
单文件 Swift 菜单栏进程,launchd 常驻,独立于 HealthOS app 运行——app 关着也照样守护。

## 三层结构

| 层 | 职责 |
| --- | --- |
| Detection | 每 5s 采样:AI 工具进程 CPU(按 app 路径精确匹配)/ 前台 app / 系统键鼠空闲 |
| Policy | 漏桶计分(活跃 +1 / 不活跃 -1);净累积满窗口 → 预警(停手 30s 可赎回)→ 保护性休息;聊天特赦、人离开跳过、睡眠清零 |
| Intervention | 菜单栏状态、右上角预警卡片、全屏呼吸休息屏(吞键鼠、高于 shielding 层) |

## 与 HealthOS app 的契约(127.0.0.1:5193,仅回环)

| 端点 | 说明 |
| --- | --- |
| `GET /state` | 相位(normal/warning/breaking)、净累积秒数、判定信号、session、暂停态 |
| `GET /sessions` | Build Session 历史(`sessions.jsonl`,净累积 ≥1 分钟起算) |
| `GET /events` | 干预记录(`events.jsonl`:预警/赎回/休息/暂停…) |
| `GET /config` | 生效配置 |
| `POST /action` | `{"type":"break"\|"pause30"\|"pause2h"\|"pauseToday"\|"resume"}` |

原则:`Raw observation ≠ Interpretation ≠ Recommendation`——代理只输出观察与相位,
解释和建议在 app 层生成;其他 OS 未来经 contracts 事件消费,不直读这些文件。

## 安装 / 更新

```bash
bash apps/health/agent/install.sh   # 编译 + 安装 launchd + 下线旧 vibeguard
```

数据目录 `~/Library/Application Support/HealthOS/`:`config.json`(检测参数)、
`agent.log`、`events.jsonl`、`sessions.jsonl`、`pause`(存在即暂停,兼容旧
`~/.vibeguard/pause`)。改配置后 `launchctl kickstart -k gui/$(id -u)/com.kenpan.healthos-focus`。

## 调试

```bash
"$HOME/Library/Application Support/HealthOS/bin/healthos-focus-agent" --test-break 8   # 演示休息屏
"$HOME/Library/Application Support/HealthOS/bin/healthos-focus-agent" --test-warn 8    # 演示预警卡片
curl -s http://127.0.0.1:5193/state | python3 -m json.tool
launchctl bootout gui/$(id -u)/com.kenpan.healthos-focus   # 卸载
```
