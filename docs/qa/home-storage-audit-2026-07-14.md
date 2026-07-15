# HomeOS 储藏 · 功能 + UI/UX 验收（2026-07-14）

**范围：** `HOME.STORAGE.19`（物品实体化 + CRUD + 搜索定位）。
**环境：** vite dev `127.0.0.1:5874`、Chromium、桌面 1280×720 / 手机 375×812、深色 + 浅色。
**自动化：** `npm run test:storage`（单测）· `npm run test:storage-ui`（smoke **19 checks**）。

## 结论

功能与 UI/UX 均通过。本轮共发现 **4 个真问题，全部已修**；其中 2 个是本次升级引入的退步，2 个是我自己的实现缺陷。

## 发现并修复的问题

| # | 问题 | 证据 | 修法 |
|---|------|------|------|
| 1 | **隐形按钮永久吃掉 60% 行宽** —— `.item-actions` 用 `opacity:0` 隐藏但仍占文档流，实测保留 **128px**，名字只剩 **83px**，导致「鞋履 · Birkenstock 拖鞋」折成 3 行。相对旧版纯 `<ul>` 是明显退步；且 hover 在触屏上根本不存在 | `getBoundingClientRect()` 实测 | 改为**点击整行即编辑**，移动/删除移入编辑表单。无 hover 悬浮按钮 → 桌面与触屏同一套交互。修后 12/12 名字全部单行 |
| 2 | **长名称撑破卡片 202px** —— `overflow-wrap: normal`，无空格的型号/URL 不断行 | 加入 52 字符无空格名后测 `scrollWidth - clientWidth` | `.item-name` / `.item-note` 加 `overflow-wrap: anywhere`。修后溢出 **202px → 0** |
| 3 | **手机触摸目标过小** —— 行高 30px、`+` 按钮 28×28 | 375px 视口实测 | `@media (max-width: 599px)` 下行高 → **38px**、图标按钮 → **40×40** |
| 4 | **搜索改词后残留旧高亮** —— 点过结果再改搜索词，`focusedItemId` 不清，高亮指向已不在结果里的物品 | 交互推演 | `oninput` 时清 `focusedItemId` |

### 一个差点静默上线的坑

问题 3 初版写成 `@media (--life-os-phone)`。**`check` 和 `build` 全绿，但整块样式是死的**：`@custom-media` 定义在 `packages/theme/src/media.css`，靠 `layout.css` 的 `@import` 进入 app.css 那条链；Svelte 组件 `<style>` 单独过 PostCSS，看不到定义，于是 `@media (--life-os-phone)` 原样输出、被浏览器整块忽略。

验证手段（已写进 README）：

```bash
grep -o "@media ([^)]*)" build/_app/immutable/assets/StorageZoneCard*.css
# 坏：@media (--life-os-phone)   好：@media (width<=599px)
```

## UI/UX 改进（本轮新增）

- **命中项在卡片内也高亮**（`li.matched`）。此前搜索只筛掉不相关的**区**，卡片里仍是整区清单，用户还得自己找哪条匹配；现在命中项浅色底、点击的那条深色底。
- **「添加」框跨卡片对齐** —— 卡片 `flex-column` + `.add-row { margin-top: auto }`。（初版还写了条 `ul + .add-row` 规则，特异性更高会覆盖 `margin-top: auto`、把对齐整个废掉，已删。）
- 卡片头部加物品计数。

## 验证矩阵

| 维度 | 结果 |
|------|------|
| v3 → v4 迁移（播种真实 v3 存档） | ✅ 字符串 → 实体，名称无损，id 确定（`s1-i0`） |
| 归一化幂等 | ✅ 单测断言 `normalize(normalize(x)) === normalize(x)`（初版两分支形状不一致，被单测抓到并修） |
| 增 / 删 / 改 / 移动 + 撤销 | ✅ 删除撤销还原到**原索引** |
| 空名 / 纯空白 | ✅ 拒绝并 warn |
| `qty` 异常值（0 / -1 / 'abc'） | ✅ 归一为 `undefined` |
| 注入文本 `<img onerror>` | ✅ 存为文本、渲染转义、导出 HTML `esc()` 正确 |
| 搜索：名称/标签/备注、多词 AND、名称优先 | ✅ |
| 搜索 → 平面图高亮所在区 | ✅ 点结果即选中区 + 标注亮起 |
| **储物 CRUD 不翻 `layoutMode`** | ✅ 508 下改物品仍是 `parametric508`（smoke 有专门守卫） |
| **墙图 ⌘Z 撤销墙体但保留物品** | ✅ `storageZones` 刻意不在 `snapshotEditSource` 里，`applyEditSource` 带当前值 |
| 概览页只读分支 | ✅ 无添加框、无可编辑行 |
| 深色 / 浅色 | ✅ 对比度正常 |
| 手机 375px | ✅ 无横向溢出，触摸目标达标 |
| 键盘：聚焦行 / 自动聚焦名称 / Esc 取消 / Enter 保存 | ✅ |
| 控制台错误 | ✅ 无 |

## 已知问题（**非本次引入**）

- **`test:plan-edit` 在 HEAD 上就是红的** —— 用只读 `git show HEAD:` 对比确认。测试与 UI 长期不同步（详见 [`apps/home/README.md`](../../apps/home/README.md)）。失败点随平面页改动漂移：本轮见过卡「删墙」，也见过卡 `.storage-picker` 弹窗不可见。储藏页从不渲染 `zone.items` 之外的东西，`plan/+page.svelte` 本次**一行未改**。
- **`test:viewport` / `test:snap` 偶发假性失败** —— 各出现一次，无法复现（后续分别 3 次、9 次全绿，干净树与改动树输出逐字节相同）。根因有二，均已确认：① dev server 被并发会话关闭（`ERR_CONNECTION_REFUSED`）；② README 记录的 vite 编译期假性失败（失败那次紧跟一次 `npm run build`）。**跑这些脚本前先让 server 跑热，并显式传地址**（默认端口 5197 现归 aios）。

## 第二轮：性能 + 健壮性（同日）

先测再改。基线（node，无代理）：

| 物品数 | hydrate | 其中 normalize |
|---|---|---|
| 31 | 0.027ms | 17% |
| 1000 | 0.098ms | 85% |
| 5000 | 0.439ms | **97%** |

`normalizeZoneItems` 每次都重建全部物品对象，是 hydrate 随库存劣化的唯一原因；而 hydrate 挂在 `$derived` 上，每次读 project 都跑。

### 改动

| 项 | 说明 |
|---|---|
| **归一化快路径** | 数据已干净时原样返回入参数组，不重建。浏览器实测两次 hydrate 现在返回**同一个 items 数组**（改前是全新对象）→ 下游 props 不再无谓抖动 |
| **id 计数器改在创建时同步** | 快路径跳过扫描 ⇒ normalize 不能再兼职推进计数器。`addStorageItem` 先 `syncStorageItemIdSeq()`，照 `createPlacement/syncPlacementIdSeq` 的既有约定。否则新装载的模块会把 `si-1` 发到已有的 `si-1` 上 |
| **同区 id 撞车重新发号** | 重复 id 会**直接崩** Svelte 的 keyed `{#each}`。来源有二：损坏存档；`${zoneId}-i${index}` 回退 id 撞上显式 id（`[{id:'sQ-i1'}, '乙']` 即可触发）。两条都有单测 |
| **搜索结果上限 100** | 1000 个命中原会渲染 1000 个 DOM 行。上限之外**如实告知**「还有 N 个未显示」，且 `zoneCodes` 覆盖全部命中 → 区筛选不受上限影响 |
| **`qty` 上限 9999** | `1e9` 原会渲染成 `×1000000000` |
| **配额失败不再静默** | `persist()` 原本 `catch { /* quota */ }` —— 用户以为存了，刷新全没。改为 console.error + 一次性 toast（不重复弹） |
| **消除逐帧数组重建** | `matchedIn()` / `moveTargets()` 原是模板里的函数调用，每次渲染给每张卡片新建数组，prop 引用一变就让卡片白重算。改为 `$derived.by` 预建 Map |
| **标签溢出** | `.chip` 补 `overflow-wrap: anywhere` |

### 测下来决定**不做**的

- **WeakSet 缓存跳过扫描**：剩余成本是穿过 `$state` 深代理读属性（实测代理让同一份扫描慢 **14.2×**：1000 件 0.107ms → 1.53ms）。缓存能抹掉它，但只要有人原地改数组就读到脏缓存 → item 无 id → keyed `{#each}` 崩，而原地改 `$state` 正是 Svelte 5 的惯用写法。真实规模（31 件）normalize 约 0.05ms。**不拿健壮性换感知不到的数字。**
- **把 normalize 移出 hydrate**（只在 `load()` 跑）：同样能省，但迁移就不再是「任何入口都自动生效」，有原始字符串漏进 UI 的风险。

### 顺带验证的既有陷阱

README 记录：高频输入直连 store 会 1 秒撑满撤销栈、烧 137ms/s（视角罗盘/滑杆踩过）。**储藏的三个输入框（搜索/添加/编辑）实测打字期间零 localStorage 写入、零撤销栈污染** —— 都只绑本地 `$state`，提交才碰 store。已加 smoke 守卫，防止以后被改成 `oninput` 直连。

### 结果

`test:storage-ui` **20 checks**；1000 件压测下每次按键同步成本 1.3–4.3ms，搜索只渲染 100 行。

## 复现

```bash
cd apps/home
npm run dev -- --port 5874          # 或 launch.json 的 "home"
npm run test:storage                # 单测，无需 server
npm run test:storage-ui -- http://127.0.0.1:5874   # 20 checks
```
