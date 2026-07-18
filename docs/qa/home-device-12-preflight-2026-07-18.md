# HOME.DEVICE.12 预检（2026-07-18）

> Ticket：[`../roadmap/apps/home.md`](../roadmap/apps/home.md) §智能家居 · ROI 🔥 前置 gate
> 目的：用半天摸底决定 DEVICE.14/VISION.15 等是否值得开干；**本文件只记事实，不假装已装 HA。**

## 预检结果（本机）

| 探测 | 结果 |
| --- | --- |
| `http://127.0.0.1:8123/` | 不可达 |
| `http://homeassistant.local:8123/` | 不可达 |
| Docker 容器名含 homeassistant/hass | 无 |
| `ha` CLI | 未安装 |
| 常见安装路径 `~/homeassistant` / `/opt/homeassistant` | 无 |

**结论：** Home Assistant **尚未在这台 Mac 上运行** → DEVICE.12 的「Govee / Nest 能拿到什么」无法在本会话完成。后续硬件线全部仍 gated。

## 建议 Ken 下一步（0.5d spike，用户侧）

1. 本机装 HA（Docker Desktop 或 [HA OS VM](https://www.home-assistant.io/installation/)；与 local-ai 同构：一个本地网关扛厂商）。
2. 登录后记下：
   - Govee 灯/插头是否进 HA、可否局域网控制
   - Nest 摄像头：有无实体、有无摄像头帧 / RTSP / 仅 WebRTC
3. 把「假设」列改成「实测」写回 `apps/home.md` §设备接入表。
4. **拿不到帧 → `HOME.VISION.15` 整项 ✗**，勿开干。

## Agent 在 HA 就绪后可做

- 写最小 `packages/` 或 `apps/home` HA REST/WS 探活脚本（只读 entity 列表）
- 用探活结果更新 hub：DEVICE.12 ✅ / VISION.15 生或死

_在 HA 未起之前，Agent 不应假装摸底完成，也不应开始 DEVICE.14。_
