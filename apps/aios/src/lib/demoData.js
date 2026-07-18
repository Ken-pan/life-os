// 本地演示数据 —— 仅在 localhost 且会话库为空时于内存中灌入(见 demoMode.js / chat.svelte.js)。
// 目标:让聊天页一进来就像一个被日常重度使用的 AI 助手——十余条跨越三周、话题各异的对话,
// 首条(默认打开的那条)是一段多轮的调试实录,把界面填满;其余对话分摊展示各类富交互面:
// 可预览的 HTML/SVG artifact、带工具调用的联网检索、本地生图、思考过程、表格与追问建议。
// 全部为纯内存数据,绝不落盘、绝不同步。

/** 一个小巧的自包含 SVG,作为「本地生图」结果的 dataURL(避免依赖任何外部资源)。 */
const DEMO_IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a1b52"/>
      <stop offset="0.55" stop-color="#7b3f8f"/>
      <stop offset="1" stop-color="#f0925a"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#sky)"/>
  <circle cx="360" cy="150" r="70" fill="#ffd9a0" opacity="0.95"/>
  <path d="M0 380 L120 300 L210 360 L320 270 L420 340 L512 290 L512 512 L0 512 Z" fill="#241033" opacity="0.85"/>
  <path d="M0 430 L90 380 L200 430 L300 375 L400 425 L512 385 L512 512 L0 512 Z" fill="#140922"/>
  <g fill="#fff" opacity="0.8">
    <circle cx="60" cy="70" r="2"/><circle cx="140" cy="120" r="1.5"/><circle cx="220" cy="60" r="2"/>
    <circle cx="90" cy="180" r="1.5"/><circle cx="480" cy="90" r="2"/><circle cx="430" cy="200" r="1.5"/>
  </g>
</svg>`

const DEMO_IMAGE_DATA_URL = `data:image/svg+xml;utf8,${encodeURIComponent(DEMO_IMAGE_SVG)}`

// 演示 artifact 的自包含 HTML(> 300 字符,内联 CSS/JS,点开即在预览面板渲染)。
const DEMO_CLOCK_HTML = `<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8" />
  <style>
    body { margin: 0; height: 100vh; display: grid; place-items: center;
      background: radial-gradient(circle at 50% 30%, #1b2a4a, #0a0f1e);
      font-family: -apple-system, system-ui, sans-serif; }
    .clock { text-align: center; color: #e8eefc; }
    .time { font-size: 64px; font-variant-numeric: tabular-nums; letter-spacing: 2px;
      text-shadow: 0 0 24px rgba(120,170,255,.5); }
    .date { margin-top: 8px; font-size: 18px; opacity: .7; }
  </style>
</head>
<body>
  <div class="clock">
    <div class="time" id="t">00:00:00</div>
    <div class="date" id="d"></div>
  </div>
  <script>
    function tick() {
      const now = new Date();
      document.getElementById('t').textContent = now.toLocaleTimeString('zh-CN', { hour12: false });
      document.getElementById('d').textContent = now.toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
    tick();
    setInterval(tick, 1000);
  </script>
</body>
</html>`

function uid() {
  // 客户端调用,crypto.randomUUID 恒有;仍做一次兜底避免罕见环境抛错。
  try {
    return crypto.randomUUID()
  } catch {
    return 'demo-' + Math.random().toString(36).slice(2)
  }
}

/** 相对今天第 daysAgo 天、某个具体钟点的时间戳——让 /history 呈现真实的错落时刻(今天 14:23、昨天 21:05…)。 */
function at(daysAgo, hour, min) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, min, 0, 0)
  return d.getTime()
}

/**
 * 构造一组(约十余条)演示对话。数组顺序即 /history 展示顺序(updatedAt 倒序),
 * 首条会被默认打开(见 chat.svelte.js 的 initialActive):故首条是内容最丰富的多轮调试实录。
 * @returns {import('./chat.svelte.js').Conversation[]}
 */
export function buildDemoConversations() {
  // —— 首条(HERO):一段多轮 React 调试实录,把聊天视图填满 ——
  // 覆盖:代码块、追问建议、思考过程(reasoning + thinkingMs)、对照表格、连续的问答往返。
  const heroChat = {
    id: 'demo-chat-debug',
    title: 'React 组件无限重渲染排查',
    titled: true,
    model: 'llm-quality',
    createdAt: at(0, 14, 5),
    updatedAt: at(0, 14, 23),
    messages: [
      {
        role: 'user',
        content:
          '我写了个 React 组件拉用户列表,一进页面就疯狂请求、控制台刷屏,像是无限重渲染。大概长这样:\n\n```jsx\nfunction UserList() {\n  const [users, setUsers] = useState([])\n  const [filter, setFilter] = useState({ role: "all" })\n\n  useEffect(() => {\n    fetch(`/api/users?role=${filter.role}`)\n      .then((r) => r.json())\n      .then(setUsers)\n  })\n\n  return <ul>{users.map((u) => <li key={u.id}>{u.name}</li>)}</ul>\n}\n```',
      },
      {
        role: 'assistant',
        content:
          '问题不在请求本身,在 `useEffect` **没有依赖数组**。不传第二个参数时,effect 每次渲染后都会执行;而 `setUsers` 会触发重渲染 → effect 再跑 → 又 `setUsers`,就成了死循环。\n\n加上依赖数组,只在 `filter.role` 变化时才重新拉取:\n\n```jsx\nuseEffect(() => {\n  let alive = true\n  fetch(`/api/users?role=${filter.role}`)\n    .then((r) => r.json())\n    .then((data) => { if (alive) setUsers(data) })\n  return () => { alive = false }  // 卸载/依赖变更时丢弃旧结果\n}, [filter.role])\n```\n\n顺手做了两件事:\n\n- **依赖数组 `[filter.role]`**:这是止血的关键,决定 effect 什么时候才重跑。\n- **`alive` 闭包 + 清理函数**:防止快速切换筛选时,先发的请求后到、覆盖掉新结果(竞态)。',
        durationMs: 3200,
      },
      {
        role: 'user',
        content:
          "加了依赖数组,刷屏是停了,但偶尔切筛选会白屏,控制台报这个,完整堆栈贴给你:\n\n```\nUncaught TypeError: Cannot read properties of null (reading 'map')\n    at UserList (UserList.jsx:18)\n    at renderWithHooks (react-dom.development.js:16305)\n    at mountIndeterminateComponent (react-dom.development.js:20074)\n\nGET /api/users?role=admin 500 (Internal Server Error)\n```",
      },
      {
        role: 'assistant',
        reasoning:
          '堆栈里有两条线索:一是 map 报在 null 上,说明 users 被设成了非数组;二是那条 500。把它们连起来——请求失败时后端返回的多半是错误对象甚至空 body,前端 .then(r => r.json()) 不看状态码照样解析,把它塞进了 setUsers,于是 users 不是数组,渲染时 .map 就炸。得在 setUsers 之前,把「响应是否成功」和「拿到的是不是数组」都各挡一道。',
        thinkingMs: 6400,
        content:
          '找到了,是两件事撞一起。`role=admin` 那次接口 **500 了**,而你的 `.then((r) => r.json())` 不看状态码照样解析,把错误响应体(或 `null`)塞进了 `setUsers`——`users` 不再是数组,渲染时 `null.map` 就崩了。\n\n补齐防御:\n\n```jsx\nuseEffect(() => {\n  let alive = true\n  fetch(`/api/users?role=${filter.role}`)\n    .then((r) => {\n      if (!r.ok) throw new Error(`HTTP ${r.status}`)\n      return r.json()\n    })\n    .then((data) => {\n      if (alive) setUsers(Array.isArray(data) ? data : [])\n    })\n    .catch((err) => {\n      if (alive) { console.error(err); setUsers([]) }\n    })\n  return () => { alive = false }\n}, [filter.role])\n```\n\n三处改动对照:\n\n| 位置 | 之前 | 现在 | 挡住的问题 |\n| --- | --- | --- | --- |\n| 状态码 | 不检查 | `if (!r.ok) throw` | 500 被当成正常数据 |\n| 赋值 | `setUsers(data)` | `Array.isArray(data) ? data : []` | 非数组导致 `.map` 崩 |\n| 失败 | 无 | `.catch` 兜底为 `[]` | 白屏,至少渲染空列表 |\n\n根因还是后端那条 500;前端这层是「就算接口抽风也不白屏」的兜底。',
        durationMs: 9100,
      },
      {
        role: 'user',
        content: '清楚了,谢谢!顺便问下,这种数据请求逻辑每个组件都手写一遍太啰嗦,有没有更省心的做法?',
      },
      {
        role: 'assistant',
        content:
          '太该抽了。手写 `useEffect + fetch` 每次都要重复处理「加载中 / 出错 / 竞态 / 缓存」,社区基本已经把这套收敛进专门的库里:\n\n- **TanStack Query(React Query)** — 最主流。一句 `useQuery` 就带上缓存、自动重试、请求去重、后台刷新,竞态它替你处理。\n- **SWR** — Vercel 出品,更轻量,`useSWR(key, fetcher)` 风格,先给缓存再悄悄更新。\n- **RTK Query** — 已经在用 Redux Toolkit 的话最顺,和 store 一体。\n\n用 React Query 重写你这段,就剩声明式的一句:\n\n```jsx\nfunction UserList() {\n  const [role, setRole] = useState("all")\n  const { data: users = [], isLoading, error } = useQuery({\n    queryKey: ["users", role],\n    queryFn: () =>\n      fetch(`/api/users?role=${role}`).then((r) => {\n        if (!r.ok) throw new Error(`HTTP ${r.status}`)\n        return r.json()\n      }),\n  })\n\n  if (isLoading) return <p>加载中…</p>\n  if (error) return <p>出错了:{error.message}</p>\n  return <ul>{users.map((u) => <li key={u.id}>{u.name}</li>)}</ul>\n}\n```\n\n竞态、缓存、`role` 变了自动重拉——全内置,不用再自己写 `alive` 那套。',
        durationMs: 5600,
        suggestions: ['React Query 怎么做分页?', '缓存多久会自动失效?', 'SWR 和 React Query 怎么选?'],
      },
    ],
  }

  // —— 数据分析:表格 + 结构性洞察 ——
  const salesChat = {
    id: 'demo-chat-sales',
    title: '上半年各渠道销售结构',
    titled: true,
    model: 'llm-quality',
    createdAt: at(0, 9, 45),
    updatedAt: at(0, 9, 48),
    messages: [
      {
        role: 'user',
        content: '这是我们上半年各渠道的销售额(万元):线上 320、线下 210、分销 150、直营 90。帮我看看结构,给点建议。',
      },
      {
        role: 'assistant',
        content:
          '先把结构算出来,总额 770 万:\n\n| 渠道 | 销售额(万元) | 占比 |\n| --- | ---: | ---: |\n| 线上 | 320 | 41.6% |\n| 线下 | 210 | 27.3% |\n| 分销 | 150 | 19.5% |\n| 直营 | 90 | 11.7% |\n\n几点观察:\n\n- **线上是绝对主力**(41.6%),但这也意味着渠道集中度偏高,过度依赖单一渠道有风险。\n- **线下 + 直营合计约 39%**,自有触点占比不低,利润率通常比分销高,值得继续做厚。\n- **分销占近两成**:走量但让利多,建议核算它的净贡献,别被 GMV 迷惑。\n\n想再深入的话,给我各渠道的**毛利率**和**获客成本**,能算出谁才是真正赚钱的渠道,而不只是卖得多。',
        durationMs: 3800,
        suggestions: ['按毛利率再排一次', '帮我做成柱状图', '分销的坑具体怎么规避?'],
      },
    ],
  }

  // —— 写作/文案:英文邮件语气改写 ——
  const emailChat = {
    id: 'demo-chat-email',
    title: '把催稿邮件改得更得体',
    titled: true,
    model: 'llm-fast',
    createdAt: at(1, 21, 3),
    updatedAt: at(1, 21, 5),
    messages: [
      {
        role: 'user',
        content: '帮我把这句改成更礼貌专业的英文邮件说法:I need the report by tomorrow.',
      },
      {
        role: 'assistant',
        content:
          "直接说「I need it by tomorrow」会有点命令感。看语气给你三档:\n\n- **中性专业**:\n  > Could you please send the report over by end of day tomorrow? Thanks in advance.\n- **更客气(对上级/客户)**:\n  > Would it be possible to have the report ready by tomorrow? Please let me know if the timeline is tight.\n- **紧急但仍得体**:\n  > I'm up against a deadline on this — would you be able to get the report to me by tomorrow? Really appreciate it.\n\n小技巧:把「I need」换成「Could you / Would it be possible」,再补一句 deadline 的缘由,对方更容易配合。",
        durationMs: 2600,
        suggestions: ['再写一版第二次催的', '结尾署名怎么写得体', '帮我把整封邮件补全'],
      },
    ],
  }

  // —— 本地生图:generate_image 工具调用挂 images(dataURL)——
  const imageChat = {
    id: 'demo-chat-image',
    title: '画一张紫色黄昏的山景',
    titled: true,
    model: 'llm-quality',
    createdAt: at(1, 17, 10),
    updatedAt: at(1, 17, 12),
    messages: [
      {
        role: 'user',
        content: '画一张紫色黄昏、有远山和星星的插画,竖构图。',
      },
      {
        role: 'assistant',
        content:
          '生成好了——紫粉渐变的黄昏天空、暖色落日、层叠远山剪影,点缀了几颗星。想要不同氛围(比如更冷的蓝调、加一轮明月,或换成雪山)告诉我,我再出一版。',
        durationMs: 9300,
        toolCalls: [
          {
            id: uid(),
            name: 'generate_image',
            arguments: JSON.stringify({
              prompt: '紫色黄昏,层叠远山剪影,暖色落日,点点星光,竖构图,插画风格',
              quality: 'quality',
            }),
            result: '已生成 1 张图片。',
            images: [DEMO_IMAGE_DATA_URL],
          },
        ],
        suggestions: ['换成冷蓝色调', '加一轮满月', '把它做成手机壁纸尺寸'],
      },
    ],
  }

  // —— SQL:按月聚合 ——
  const sqlChat = {
    id: 'demo-chat-orders',
    title: '按月统计订单数和金额',
    titled: true,
    model: 'llm-fast',
    createdAt: at(2, 11, 28),
    updatedAt: at(2, 11, 30),
    messages: [
      {
        role: 'user',
        content: '有一张 orders 表(user_id, amount, created_at),帮我写 SQL 查每个月的订单数和总金额,按月份排序。',
      },
      {
        role: 'assistant',
        content:
          "按自然月聚合,用 `date_trunc`(Postgres 写法):\n\n```sql\nSELECT\n  date_trunc('month', created_at)::date AS month,\n  count(*)                              AS order_count,\n  sum(amount)                           AS total_amount\nFROM orders\nGROUP BY 1\nORDER BY 1;\n```\n\n说明:\n\n- `date_trunc('month', …)` 把时间归到当月 1 号,`::date` 去掉时分秒更好看。\n- `GROUP BY 1` 指按第一个 select 列分组,省得把表达式重写一遍。\n- MySQL 没有 `date_trunc`,换成 `DATE_FORMAT(created_at, '%Y-%m-01')` 即可。",
        durationMs: 3100,
        suggestions: ['只统计已支付的订单', '加一列环比增长', '换成 MySQL 写法'],
      },
    ],
  }

  // —— 正则 ——
  const regexChat = {
    id: 'demo-chat-phone',
    title: '匹配中国大陆手机号的正则',
    titled: true,
    model: 'llm-fast',
    createdAt: at(3, 23, 39),
    updatedAt: at(3, 23, 40),
    messages: [
      {
        role: 'user',
        content: '给我一个匹配中国大陆手机号的正则,要能校验 1 开头、第二位 3-9。',
      },
      {
        role: 'assistant',
        content:
          '标准的 11 位手机号,`1` 开头、第二位 `3-9`、后面 9 位数字:\n\n```\n^1[3-9]\\d{9}$\n```\n\n拆开看:\n\n- `^` `$` 锚定首尾,防止把长串数字里的一段误判成手机号;\n- `1` 固定首位;\n- `[3-9]` 第二位(排除了 10、11、12 开头);\n- `\\d{9}` 剩下 9 位任意数字。\n\n注意:这只是**格式**校验,不代表号段真实存在(运营商号段一直在变)。要从一段文本里**提取**而不是整体校验,把 `^…$` 换成词边界 `(?<![\\d])1[3-9]\\d{9}(?![\\d])`。',
        durationMs: 2200,
        suggestions: ['JS 里怎么用这个正则', '再写个座机号的', '怎么顺便校验号段真实性'],
      },
    ],
  }

  // —— 联网检索:browser_search 工具调用 + 思考过程 + thinkingMs ——
  const searchChat = {
    id: 'demo-chat-runes',
    title: 'Svelte 5 的 runes 是什么',
    titled: true,
    model: 'llm-quality',
    createdAt: at(4, 9, 37),
    updatedAt: at(4, 9, 40),
    messages: [
      {
        role: 'user',
        content: 'Svelte 5 的 runes 到底是什么?和以前的 $: 有啥区别?帮我查一下最新说法。',
      },
      {
        role: 'assistant',
        reasoning:
          '用户问的是框架的「最新」特性,这类随版本变化的东西不能只凭记忆,先联网查证官方文档确认 Svelte 5 的正式表述,再对比旧的响应式语法回答。',
        thinkingMs: 5200,
        content:
          '查了官方文档,结论如下。\n\n**Runes** 是 Svelte 5 引入的一组以 `$` 开头的编译器符号(不是函数,是语言级信号),用来显式声明响应式:\n\n| 用途 | Svelte 5 (runes) | Svelte 3/4 |\n| --- | --- | --- |\n| 局部状态 | `let n = $state(0)` | `let n = 0` |\n| 派生值 | `$derived(n * 2)` | `$: doubled = n * 2` |\n| 副作用 | `$effect(() => …)` | `$: { … }` |\n| 组件属性 | `let { x } = $props()` | `export let x` |\n\n关键区别:\n\n- 旧的 `$:` 是**文件顶层专属**的魔法,在 `.js`/`.ts` 里用不了;runes 在 `.svelte.js` 模块里也能用,响应式不再被组件边界束缚。\n- runes 是**显式**的:一眼能看出哪些是状态、哪些是派生,不再靠「赋值即响应」的隐式规则,大型组件更好维护。\n\n信息来源(截至今天查证):\n\n- Svelte 官方文档 · Runes 章节 — svelte.dev/docs/svelte/what-are-runes',
        durationMs: 8700,
        toolCalls: [
          {
            id: uid(),
            name: 'browser_search',
            arguments: JSON.stringify({ query: 'Svelte 5 runes 官方文档 $state $derived' }),
            result:
              '1. What are runes? • Svelte docs — Runes are symbols that control the Svelte compiler. $state, $derived, $effect, $props…\n2. Svelte 5 migration guide — Replaces `$:` reactive statements with explicit runes; works in .svelte.js modules.\n3. Svelte 5 is out! (blog) — Runes make reactivity explicit and universal.',
          },
        ],
        suggestions: ['$effect 和 onMount 有什么不同?', '旧项目怎么迁移到 runes?', '.svelte.js 模块怎么用'],
      },
    ],
  }

  // —— 解释概念 ——
  const conceptChat = {
    id: 'demo-chat-cap',
    title: '大白话讲讲 CAP 定理',
    titled: true,
    model: 'llm-quality',
    createdAt: at(6, 15, 54),
    updatedAt: at(6, 15, 57),
    messages: [
      {
        role: 'user',
        content: '用大白话解释一下分布式系统的 CAP 定理,我总记不住。',
      },
      {
        role: 'assistant',
        content:
          'CAP 说的是:一个分布式系统里,**一致性(C)、可用性(A)、分区容错(P)** 三者最多同时保住两个。\n\n先拆概念:\n\n- **C 一致性** — 所有节点同一时刻看到的数据一样(你刚写的,别人立刻读到)。\n- **A 可用性** — 每个请求都有响应,不卡死、不报「服务不可用」。\n- **P 分区容错** — 节点间网络断了(分区),系统仍能继续正常工作。\n\n关键点:**P 几乎不可选**——只要是跨机器的分布式系统,网络就一定会偶尔断,所以 P 是前提。真正的取舍其实是在网络分区发生时,**在 C 和 A 之间二选一**:\n\n- 选 **CP**:分区时宁可拒绝请求也不返回过期数据(如 ZooKeeper、etcd)。\n- 选 **AP**:分区时照常响应,允许短暂不一致、事后再同步(如 Cassandra、DynamoDB)。\n\n一句话记忆:**网线一断,你是选「宁可不可用也要对」,还是「宁可有点错也要活」。**',
        durationMs: 4200,
        suggestions: ['那 BASE 理论又是什么?', 'MySQL 主从属于 CP 还是 AP?', '最终一致性怎么实现'],
      },
    ],
  }

  // —— 可预览的 HTML artifact(> 300 字符,点开在侧栏渲染)——
  const artifactChat = {
    id: 'demo-chat-clock',
    title: '做一个会走的数字时钟',
    titled: true,
    model: 'llm-quality',
    createdAt: at(8, 20, 15),
    updatedAt: at(8, 20, 18),
    messages: [
      {
        role: 'user',
        content: '帮我写一个好看的网页数字时钟,深色背景,能实时走秒。',
      },
      {
        role: 'assistant',
        content:
          '给你一个单文件、自包含的实时时钟,深色渐变背景 + 发光数字,直接在右侧预览面板就能看到它走秒:\n\n```html\n' +
          DEMO_CLOCK_HTML +
          '\n```\n\n它每秒刷新一次,日期按中文习惯显示。想换配色改那几个渐变色即可,也可以把字号 `64px` 调大做成整屏挂钟。',
        durationMs: 4100,
        suggestions: ['加上秒针的模拟表盘', '让它支持多个时区', '换成浅色主题'],
      },
    ],
  }

  // —— 中英翻译:落地页文案 ——
  const translateChat = {
    id: 'demo-chat-translate',
    title: '落地页文案翻译成英文',
    titled: true,
    model: 'llm-quality',
    createdAt: at(11, 13, 25),
    updatedAt: at(11, 13, 26),
    messages: [
      {
        role: 'user',
        content: '把这句翻译成自然的英文,给 App 落地页用:「让每一次记录,都成为更懂你的开始。」',
      },
      {
        role: 'assistant',
        content:
          '落地页文案讲究简洁有力,直译会很生硬。几个方向:\n\n- **贴原意**:\n  > Every note you take teaches it to know you better.\n- **更像 slogan(短)**:\n  > The more you log, the better it knows you.\n- **强调「开始」这层**:\n  > Every entry is a step toward an assistant that truly gets you.\n\n我个人更推荐第二条:主谓对仗、口语、适合放大字号做主标题。中文那句的「懂你」是情感落点,英文里用 knows you 比 understands 更自然口语。',
        durationMs: 2900,
        suggestions: ['再要 5 个备选', '配一句英文副标题', '换成更高端冷淡的调性'],
      },
    ],
  }

  // —— 旅行规划 ——
  const travelChat = {
    id: 'demo-chat-kyoto',
    title: '京都三日游行程',
    titled: true,
    model: 'llm-quality',
    createdAt: at(14, 8, 5),
    updatedAt: at(14, 8, 12),
    messages: [
      {
        role: 'user',
        content: '第一次去京都,玩三天,喜欢古迹和安静的地方,不爱人挤人。帮我排个行程。',
      },
      {
        role: 'assistant',
        content:
          '避开最挤的午后人潮,给你排个「早出 + 偏东山/西北」的三天,节奏偏慢:\n\n**Day 1 · 东山南段(赶早)**\n- 清水寺(8:00 前到,几乎没人)→ 二年坂三年坂石板路 → 高台寺 → 下午去建仁寺(游客少、枯山水安静)。\n\n**Day 2 · 岚山与西北**\n- 一早嵯峨野竹林(9 点前拍空镜)→ 天龙寺庭园 → 常寂光寺(枫季绝美、人少)→ 傍晚渡月桥。\n\n**Day 3 · 洛北静谧**\n- 上贺茂/下鸭神社 → 大德寺塔头(高桐院超安静)→ 下午银阁寺 + 哲学之道慢走收尾。\n\n几个避坑:\n\n- **伏见稻荷** 想拍空千本鸟居,得 7:00 前或天黑后上山,白天基本是人海。\n- 京都公交易堵,东山—岚山这种跨区,坐 **JR 或地铁**比巴士快很多。\n- 大寺庙多半 16:30 就停止入场,古迹尽量排上午。',
        durationMs: 5400,
        suggestions: ['帮我配上每天的午餐推荐', '三天住哪个区域方便', '加一个抹茶体验'],
      },
    ],
  }

  // —— 头脑风暴:起名 ——
  const namingChat = {
    id: 'demo-chat-name',
    title: '给隐私 AI 助手起英文名',
    titled: true,
    model: 'llm-quality',
    createdAt: at(17, 22, 45),
    updatedAt: at(17, 22, 47),
    messages: [
      {
        role: 'user',
        content: '我在做一个本地优先、注重隐私的个人 AI 助手,帮我想几个英文名字,好记、有科技感但不冷冰冰。',
      },
      {
        role: 'assistant',
        content:
          '本地 + 隐私 + 温度,这几个方向都往「贴身、私密、随身」的意象靠:\n\n- **Hearth** — 「炉火」,家的温暖中心,呼应本地/私密,不俗气。\n- **Nook** — 「角落」,小而私密的专属空间,好读好记。\n- **Kindred** — 「亲近之人」,强调懂你、有温度。\n- **Lumen** — 一点微光,科技感但柔和。\n- **Tandem** — 「协同」,人和 AI 并肩,弱化冷冰冰的工具感。\n\n想更直白点出「本地/离线」卖点,**Offbeat**、**Quietframe**、**Homebound** 也可以考虑。\n\n我最看好 **Hearth**:一个音节、有画面感,和「你的数据不出这台设备」的定位天然契合。',
        durationMs: 3600,
        suggestions: ['查一下 Hearth 有没有被占用', '再往「记忆」意象想几个', '配个一句话 slogan'],
      },
    ],
  }

  // —— 生活/效率建议 ——
  const adviceChat = {
    id: 'demo-chat-procrastinate',
    title: '总是拖延怎么办',
    titled: true,
    model: 'llm-quality',
    createdAt: at(20, 7, 31),
    updatedAt: at(20, 7, 33),
    messages: [
      {
        role: 'user',
        content: '我总是拖延,任务一大就不想动,道理都懂但就是做不到。有什么真的有用的办法?',
      },
      {
        role: 'assistant',
        content:
          '「道理都懂但做不到」很正常——拖延多半不是懒,而是**任务太大、无从下手**时大脑的逃避反应。别跟意志力硬刚,改从「降低启动门槛」入手:\n\n- **两分钟起步**:只承诺做 2 分钟。目标不是做完,是「开始」——绝大多数拖延卡在启动那一下,动起来往往就停不下来。\n- **拆到蠢**:把「写报告」拆成「打开文档、敲个标题」。大任务让人瘫,小到有点可笑的步骤才不触发逃避。\n- **绑定情境**:把任务挂在已有习惯后面,比如「倒完咖啡就写三行」,少一次「要不要做」的内耗。\n- **允许做得烂**:先出一版垃圾草稿,完美主义是拖延最大的帮凶。\n\n如果长期如此、还伴随明显的自责和空虚,那可能不只是习惯问题,值得认真对待、必要时找专业帮助。先从今天挑**一件**最小的事,只做两分钟试试。',
        durationMs: 4000,
        suggestions: ['番茄工作法适合我吗', '怎么对抗完美主义', '手机太分心怎么办'],
      },
    ],
  }

  // 按 updatedAt 倒序返回(最新在前):首条 heroChat 会被默认打开,其余构成错落的历史列表。
  return [
    heroChat,
    salesChat,
    emailChat,
    imageChat,
    sqlChat,
    regexChat,
    searchChat,
    conceptChat,
    artifactChat,
    translateChat,
    travelChat,
    namingChat,
    adviceChat,
  ]
}
