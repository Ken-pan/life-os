# Web State Bridge

Local Express server + Cursor MCP stdio server.

## Commands

```bash
npm install
npm run bridge    # HTTP API on http://127.0.0.1:17321
npm run mcp       # MCP stdio (Cursor spawns this)
```

## HTTP API

| Method | Path                 | 说明               |
| ------ | -------------------- | ------------------ |
| GET    | `/health`            | 健康检查           |
| GET    | `/latest`            | 最新 snapshot JSON |
| POST   | `/snapshot`          | 扩展 POST 写入     |
| POST   | `/commands/open-url` | MCP 排队打开 URL   |
| GET    | `/commands/next`     | 扩展轮询下一条命令 |
| POST   | `/commands/ack`      | 扩展确认完成       |

## Environment

| Variable                      | Default                               |
| ----------------------------- | ------------------------------------- |
| `WEB_STATE_BRIDGE_PORT`       | `17321`                               |
| `WEB_STATE_BRIDGE_URL`        | `http://127.0.0.1:17321` (MCP client) |
| `WEB_STATE_ALLOW_ANY`         | `0` — allow all hosts                 |
| `WEB_STATE_ALLOW_AMAZON`      | `0`                                   |
| `WEB_STATE_ALLOW_BESTBUY`     | `0`                                   |
| `WEB_STATE_ALLOW_TARGET`      | `0`                                   |
| `WEB_STATE_ALLOW_ROCKETMONEY` | `0` — Rocket Money finance verify     |
| `WEB_STATE_ALLOW_ROBINHOOD`   | `0` — Robinhood finance verify        |

## Data

Snapshots saved to `data/latest-snapshot.json` and timestamped copies `data/snapshot-*.json`.
