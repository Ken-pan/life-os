<script>
  import CatalogStateBlock from '../lib/CatalogStateBlock.svelte'
  import {
    LineChart,
    BarChart,
    DonutChart,
    Sparkline,
    Heatmap,
    Treemap,
    MindMap,
  } from '@life-os/platform-web/svelte/charts'

  // ── 示例数据(贴近真实 app 场景) ──
  const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月']
  const spendIncome = [
    { label: '支出', values: [6800, 7200, 5900, 8100, 7400, 6600, 7050] },
    { label: '收入', values: [9800, 9800, 10400, 9800, 11200, 9800, 10100] },
  ]
  const weightTrend = [
    { label: '体重', values: [72.4, 72.1, 71.8, 71.9, 71.2, 70.8, null, 70.5, 70.1, 69.8, 69.9, 69.4] },
  ]
  const weeks = Array.from({ length: 12 }, (_, i) => `W${i + 1}`)

  const categorySpend = ['餐饮', '交通', '订阅', '购物', '房租', '娱乐']
  const categoryValues = [
    { label: '本月支出', values: [2350, 480, 320, 1240, 3200, 560] },
  ]

  const volumeByWeek = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6']
  const volumeSeries = [
    { label: '推', values: [4200, 4600, 4400, 5100, 4800, 5300] },
    { label: '拉', values: [3800, 4100, 4300, 4200, 4600, 4700] },
    { label: '腿', values: [5600, 5200, 6100, 5800, 6400, 6200] },
  ]

  const allocation = [
    { label: '指数基金', value: 42000 },
    { label: '个股', value: 18500 },
    { label: '现金', value: 12000 },
    { label: '加密', value: 4200 },
    { label: '债券', value: 8600 },
  ]

  const heatRows = ['一', '二', '三', '四', '五', '六', '日']
  const heatCols = Array.from({ length: 16 }, (_, i) => `${i + 1}`)
  // 伪随机但确定的活跃度矩阵(避免每次渲染跳动)
  const heatValues = heatRows.map((_, r) =>
    heatCols.map((_, c) => {
      const seed = Math.sin(r * 7.3 + c * 2.9) * 43758.5453
      const t = seed - Math.floor(seed)
      return t < 0.22 ? 0 : Math.round(t * 90)
    }),
  )

  const sparkUp = [42, 45, 44, 48, 47, 52, 51, 55, 58, 57, 62, 66]
  const sparkDown = [88, 86, 87, 82, 80, 76, 78, 72, 70, 66, 65, 61]
  const sparkFlat = [54, 55, 53, 56, 54, 55, 54, 56, 55, 54, 55, 55]

  const yen = (v) =>
    v >= 10000 ? `¥${Math.round(v / 100) / 100}万` : `¥${v.toLocaleString()}`

  const treemapSpend = [
    { label: '房租', value: 3200, meta: '1 笔' },
    { label: '餐饮', value: 2350, meta: '34 笔' },
    { label: '购物', value: 1240, meta: '9 笔' },
    { label: '娱乐', value: 560, meta: '6 笔' },
    { label: '交通', value: 480, meta: '18 笔' },
    { label: '订阅', value: 320, meta: '7 笔' },
    { label: '医疗', value: 180, meta: '2 笔' },
    { label: '宠物', value: 150, meta: '3 笔' },
    { label: '礼物', value: 120, meta: '1 笔' },
    { label: '其它杂项', value: 90, meta: '4 笔' },
  ]

  const mindmapTree = {
    label: 'Life OS',
    children: [
      {
        label: 'Finance',
        children: [
          { label: '记账与回顾' },
          { label: '持仓组合', children: [{ label: '再平衡建议' }, { label: '快照对比' }] },
          { label: '订阅管理' },
        ],
      },
      {
        label: 'Fitness',
        children: [
          { label: '训练计划' },
          { label: '统计与 PR' },
          { label: '体重追踪' },
        ],
      },
      {
        label: 'Home',
        children: [
          { label: '户型扫描', children: [{ label: 'RoomPlan 导入' }] },
          { label: '家具布置' },
        ],
      },
      {
        label: 'Music',
        children: [{ label: '本地曲库' }, { label: '歌词与队列' }],
      },
      {
        label: 'Planner',
        children: [{ label: '今日节奏' }, { label: '周回顾' }],
      },
    ],
  }
</script>

<section class="catalog-section" data-testid="showcase-charts">
  <h2 class="catalog-section__title">Charts</h2>
  <p class="catalog-section__lead">
    通用数据图表族(<code>@life-os/platform-web/svelte/charts</code>)。
    单系列走品牌 <code>--chart-line</code>(accent),多系列走验证过的
    categorical 槽位 <code>--chart-series-1..8</code>(固定顺序,CVD 安全)。
    全部自带 crosshair/悬浮读数、hairline 网格、圆角数据端与 2px 表面间隙。
  </p>

  <div class="catalog-panel catalog-grid">
    <CatalogStateBlock stateId="line" label="LineChart — 单系列面积(accent)与多系列对比">
      <div class="charts-demo-card">
        <h3 class="charts-demo-card__title">体重趋势(12 周,含缺测断线)</h3>
        <LineChart
          labels={weeks}
          series={weightTrend}
          area
          height={180}
          baseline="auto"
          format={(v) => `${Math.round(v * 10) / 10}kg`}
        />
      </div>
      <div class="charts-demo-card">
        <h3 class="charts-demo-card__title">收支对比(月度)</h3>
        <LineChart
          labels={months}
          series={spendIncome}
          height={200}
          format={yen}
        />
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="bar" label="BarChart — 单系列直接标注 / 多系列分组">
      <div class="charts-demo-card">
        <h3 class="charts-demo-card__title">分类支出(本月)</h3>
        <BarChart labels={categorySpend} series={categoryValues} format={yen} />
      </div>
      <div class="charts-demo-card">
        <h3 class="charts-demo-card__title">训练容量 · 分组(kg/周)</h3>
        <BarChart labels={volumeByWeek} series={volumeSeries} height={190} />
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="stacked" label="BarChart — 堆叠(2px 表面间隙)与横向排名">
      <div class="charts-demo-card">
        <h3 class="charts-demo-card__title">训练容量 · 堆叠</h3>
        <BarChart labels={volumeByWeek} series={volumeSeries} stacked height={190} />
      </div>
      <div class="charts-demo-card">
        <h3 class="charts-demo-card__title">分类支出排名</h3>
        <BarChart
          labels={[...categorySpend].sort(
            (a, b) =>
              categoryValues[0].values[categorySpend.indexOf(b)] -
              categoryValues[0].values[categorySpend.indexOf(a)],
          )}
          series={[
            {
              label: '本月支出',
              values: [...categoryValues[0].values].sort((a, b) => b - a),
            },
          ]}
          horizontal
          format={yen}
        />
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="donut" label="DonutChart — 构成占比 + 中心 hero 数值">
      <div class="charts-demo-card">
        <h3 class="charts-demo-card__title">资产配置</h3>
        <DonutChart
          items={allocation}
          centerValue="¥8.5万"
          centerLabel="总资产"
          format={yen}
        />
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="sparkline" label="Sparkline — stat 瓦片的 trend 通道">
      <div class="life-os-grid life-os-grid--kpi charts-stat-grid">
        <div class="settings-block stat">
          <span class="stat__label">静息心率</span>
          <span class="stat__value">54</span>
          <span class="stat__delta stat__delta--up">▼ 3 bpm</span>
          <Sparkline values={sparkDown} ariaLabel="静息心率 12 周趋势" />
        </div>
        <div class="settings-block stat">
          <span class="stat__label">周训练容量</span>
          <span class="stat__value">6.2K</span>
          <span class="stat__delta stat__delta--up">▲ 8%</span>
          <Sparkline values={sparkUp} ariaLabel="训练容量 12 周趋势" />
        </div>
        <div class="settings-block stat">
          <span class="stat__label">订阅月支出</span>
          <span class="stat__value">¥320</span>
          <span class="stat__delta stat__delta--flat">— 持平</span>
          <Sparkline values={sparkFlat} area={false} ariaLabel="订阅支出趋势" />
        </div>
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="heatmap" label="Heatmap — 活跃强度(accent 单色相分位)">
      <div class="charts-demo-card">
        <h3 class="charts-demo-card__title">听歌活跃 · 周 × 近 16 天</h3>
        <Heatmap rows={heatRows} cols={heatCols} values={heatValues} colEvery={3} />
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="treemap" label="Treemap — 部分-整体(>8 块折叠为「其他」)">
      <div class="charts-demo-card">
        <h3 class="charts-demo-card__title">分类支出构成(本月)</h3>
        <Treemap items={treemapSpend} height={280} format={yen} />
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="mindmap" label="MindMap — 层级鸟瞰(分支各占一个槽位色,点击折叠)">
      <div class="charts-demo-card charts-demo-card--wide">
        <h3 class="charts-demo-card__title">Life OS 模块地图</h3>
        <MindMap root={mindmapTree} />
      </div>
    </CatalogStateBlock>
  </div>
</section>

<style>
  .catalog-section {
    padding: 24px;
  }
  .catalog-section__title {
    margin: 0 0 8px;
    font-size: var(--text-2xl);
  }
  .catalog-section__lead {
    margin: 0 0 20px;
    color: var(--t2, var(--text-secondary));
    font-size: var(--text-sm);
  }
  .charts-demo-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--card-radius, 12px);
    padding: var(--card-padding, 16px);
    max-width: 640px;
  }
  .charts-demo-card + .charts-demo-card {
    margin-top: 16px;
  }
  .charts-demo-card--wide {
    max-width: 900px;
  }
  .charts-demo-card__title {
    margin: 0 0 12px;
    font-size: var(--text-md);
    font-weight: 600;
    color: var(--t2, var(--text-secondary));
  }
  .charts-stat-grid {
    max-width: 640px;
  }
  .charts-stat-grid :global(.sparkline) {
    margin-top: 6px;
  }
</style>
