# ⚠️ Chrome 加载扩展 — 请读这一行

**Load unpacked 必须选择本目录下的 `extension/` 文件夹，不是 `web-state-devtools/` 根目录。**

```
✅ 正确路径：
   …/life-os/tools/web-state-devtools/extension

❌ 错误路径（会报 Manifest file is missing）：
   …/life-os/tools/web-state-devtools
```

## 步骤

1. 打开 `chrome://extensions`
2. 开启 **Developer mode**
3. **Load unpacked** → 选择 **`extension`** 文件夹（与本文件同级）
4. 启动 bridge：`cd ../bridge && npm install && npm run bridge`
5. 打开任意网页 → 点扩展图标 → **Capture current tab** → **Send latest to localhost**

完整文档：[README.md](./README.md)
