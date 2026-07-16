# vendor/ — Web State DevTools 订单页解析器（复制件）

来源：`web-state-devtools/extension/adapters/{amazon,target,bestbuy}-orders.js`

Chrome load-unpacked 要求所有文件在扩展目录内，无法引用仓库外文件，所以是复制
而非引用。**不要在这里改解析逻辑** —— 上游修好后重新复制：

```bash
cp "/Users/kenpan/「Projects」/web-state-devtools/extension/adapters/"{amazon,target,bestbuy}-orders.js \
   apps/finance/extension/vendor/
```

三个文件都是自包含 IIFE，把 adapter 注册到 `window.__WSD_ADAPTERS__`
（content script 隔离世界，跟页面与 WSD 扩展互不可见）。
消费方：`content/merchantOrders.js`。

同步时间：2026-07-16
