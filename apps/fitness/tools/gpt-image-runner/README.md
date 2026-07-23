# Kenos Train GPT Image Runner

定时驱动你已登录的 ChatGPT 网页，逐张生成 P0 批次的 12 张动作示范图。图锚定方案与 prompt 同源于 `../../docs/exercise-image-prompts.md`（v3）。

## 安装（一次性）

1. Chrome 打开 `chrome://extensions`，右上角开「开发者模式」。
2. 「加载已解压的扩展程序」→ 选 `apps/fitness/tools/gpt-image-runner/` 目录。
3. 确保 Chrome 已登录 chatgpt.com。

## 使用

- 点扩展图标 → **开始**。之后它每隔 10 分钟（±25% 抖动）自动：开新会话 → 附「三视图 + 同体位构图锚」两张参考 → 填 prompt → 发送 → 等生成 → 把成品下载到 `下载/kenos-train/<动作id>.png`。
- **立即跑下一张**：手动触发一张（无视暂停，但仍受退避/日上限约束）。
- 单张失败可点「重跑」重新入队。

## 频率保护（不去碰限流，而是躲着走）

- 同一时刻只跑 1 张；默认间隔 10 分钟 ± 抖动（popup 可调，下限 5 分钟）。
- 回复文案疑似限流（达到上限/稍后再试/rate limit 等）→ 该张退回队列，**自动退避 60 分钟**。
- 日上限默认 20 张，到量即停。
- 只回文字没出图 / 超时 → 标失败不重试，人工看一眼再决定重跑。

## 产出后续

1. 人工过验收清单（见 prompts 文档：脸像/比例/动作标准/无 logo…）。
2. 通过的转 jpg 放入图库并登记：
   ```bash
   sips -s format jpeg ~/Downloads/kenos-train/<id>.png --out apps/fitness/static/assets/images/exercises/<id>.jpg
   ```
   然后把 `<id>` 加进 `src/lib/data/program.js` 的 `DEDICATED_EX_IMAGE_IDS`。

## 已知边界

- 选择器基线 2026-07 实测（`#prompt-textarea` / `#composer-submit-button` / `[data-message-author-role="assistant"]`），ChatGPT 改版需同步 `content.js` 顶部注释处的选择器。
- ChatGPT 标签放后台时浏览器会节流定时器，完成检测可能慢几十秒，不影响正确性。
- 生成中途别在同一会话里手动打字（会互相干扰）；平时正常用 ChatGPT 开别的会话不受影响。
