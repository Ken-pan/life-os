/**
 * 储物区规划单测。不需要 dev server / VLM / Supabase。
 *   node scripts/storage-plan-unit.mjs
 *
 * 锁住两条判据:
 * - 高度带取自 placements.js 的竖直权威(实测 elevIn/heightIn 优先,退规格)
 * - 类目按作业点的**几何距离**分配,不是按柜子名字的字面匹配
 */
import assert from 'node:assert/strict'
import {
  planStorageZones,
  resolveZoneByGeometry,
  anchorOfItem,
  reachBandsOf,
  zoneReach,
  REACH,
} from '../src/lib/spatial/storage-plan.js'

const ft = (v) => v * 36

/**
 * 一室户:厨房(灶台+水槽)在西,宠物区在东。
 * 三个储物区:灶边柜、水槽上吊柜、宠物架。
 */
function home(over = {}) {
  return {
    fixtures: [
      { id: 'fx-stove', kind: 'stove', label: '灶台', bounds: { x: ft(1), y: ft(1), w: ft(2), h: ft(2) } },
      { id: 'fx-sink', kind: 'kitchen_sink', label: '水槽', bounds: { x: ft(6), y: ft(1), w: ft(2), h: ft(2) } },
    ],
    placements: [
      { id: 'pl-crate', kind: 'pet_crate', label: '狗笼', x: ft(20), y: ft(1), w: ft(3), h: ft(3), rotation: 0 },
      // 灶边柜:台面下,0–36″(黄金区)
      { id: 'pl-a', kind: 'cabinet', label: '灶边柜', x: ft(2), y: ft(4), w: ft(2), h: ft(2), rotation: 0, attrs: { heightIn: 36 } },
      // 水槽上吊柜:wall_cabinet 规格 elev=54 tall=30 → 54–84″(全过肩)
      { id: 'pl-b', kind: 'wall_cabinet', label: '水槽上柜', x: ft(6), y: ft(4), w: ft(2), h: ft(1), rotation: 0 },
      // 宠物架:0–62″
      { id: 'pl-c', kind: 'shelf', label: '宠物架', x: ft(21), y: ft(5), w: ft(2), h: ft(1), rotation: 0, attrs: { heightIn: 62 } },
    ],
    storageZones: [
      { id: 'z-a', code: 'S1', nameZh: '灶边柜', locationZh: '厨房', formZh: '柜体', placementId: 'pl-a', bounds: { x: ft(2), y: ft(4), w: ft(2), h: ft(2) }, marker: { x: 0, y: 0 }, items: [] },
      { id: 'z-b', code: 'S2', nameZh: '水槽上柜', locationZh: '厨房', formZh: '吊柜', placementId: 'pl-b', bounds: { x: ft(6), y: ft(4), w: ft(2), h: ft(1) }, marker: { x: 0, y: 0 }, items: [] },
      { id: 'z-c', code: 'S3', nameZh: '宠物架', locationZh: '餐区', formZh: '开放架', placementId: 'pl-c', bounds: { x: ft(21), y: ft(5), w: ft(2), h: ft(1) }, marker: { x: 0, y: 0 }, items: [] },
    ],
    ...over,
  }
}

// —— 高度带 ——
{
  assert.deepEqual(reachBandsOf(0, 36), ['stoop', 'golden'], '台面下柜跨弯腰+黄金')
  assert.deepEqual(reachBandsOf(54, 84), ['reach', 'tiptoe'], '吊柜整个过肩')
  assert.deepEqual(reachBandsOf(0, 92), ['stoop', 'golden', 'reach', 'tiptoe'], '高塔跨全部')
  assert.deepEqual(reachBandsOf(24, 40), ['golden'], '只在黄金区')
}

// 竖直区间必须走 placements.js 的权威,不能自己从 attrs 推 ——
// 吊柜没有 heightIn,规格给的 elev=54/tall=30 才是它的真区间;
// 自己推会把它算成「未知」或 0–30(贴地),两种都错得离谱。
{
  const p = home()
  const wall = zoneReach(p.storageZones[1], p)
  assert.equal(wall.lo, 54, '吊柜底沿走规格 elev')
  assert.equal(wall.hi, 84, '吊柜顶沿 = elev + tall')
  assert.equal(wall.measured, false, '规格推的不能标成实测')

  const base = zoneReach(p.storageZones[0], p)
  assert.equal(base.hi, 36, '实测 heightIn 优先')
  assert.equal(base.measured, true)

  // 实测的离地高度要压过规格 —— 冰箱顶吊柜 elevIn=66,不是规格的 54
  const onFridge = home()
  onFridge.placements[2].attrs = { elevIn: 66, heightIn: 22 }
  const r = zoneReach(onFridge.storageZones[1], onFridge)
  assert.equal(r.lo, 66, '实测 elevIn 压过规格')
  assert.equal(r.hi, 88)
}

// 没绑家具的区:算不了人体工学,老实说没有,不许编个默认高度
{
  const p = home()
  p.storageZones[0].placementId = undefined
  assert.equal(zoneReach(p.storageZones[0], p), null)
}

// —— 物品 → 作业点 ——
{
  assert.equal(anchorOfItem({ name: 'Instant Pot Pro 压力锅' }).id, 'stove')
  assert.equal(anchorOfItem({ name: '沥水碗碟架' }).id, 'sink')
  assert.equal(anchorOfItem({ name: 'Samsung 回音壁+低音炮' }).id, 'tv')
  assert.equal(anchorOfItem({ name: 'Roborock F25 洗地机' }).id, 'laundry')
  assert.equal(anchorOfItem({ name: 'Canon 激光打印机' }).id, 'desk')

  // 宠物必须压过厨房:喂食器带「食」、饮水机带「水」,顺序错了就被灶台/水槽抢走。
  // 实测里这三件正是这么跑进厨房下柜、占着离灶 4.3ft 黄金位的。
  assert.equal(anchorOfItem({ name: 'PETLIBRO 8L 自动喂食器' }).id, 'pet')
  assert.equal(anchorOfItem({ name: 'Cheerble 4L 无泵宠物饮水机' }).id, 'pet')
  assert.equal(anchorOfItem({ name: 'HQ4US 狗厕所/尿垫架' }).id, 'pet')
  // 洗地机带「洗」,不能被水槽抢走
  assert.equal(anchorOfItem({ name: 'DREAME N20 蒸汽地毯机' }).id, 'laundry')

  // 人话短名看不出归属时,商家标题得能救回来 ——
  // 「柜门上分层置物架」的标题里写着 Bathroom / Under Sink Area
  assert.equal(
    anchorOfItem({
      name: '柜门上分层置物架',
      purchase: { title: 'Over the Cabinet Tiered Shelves - Portable Organizer for Bathroom, Under Sink Area' },
    })?.id,
    'vanity',
    '标题里的 Bathroom 该被认出来',
  )

  // 容器本身不属于任何作业点 —— 它是分格的工具,不是被存的东西
  assert.equal(anchorOfItem({ name: '13×13″ 布艺收纳箱 ×6（格子柜用）' }), null)
  assert.equal(anchorOfItem({ name: 'Nazhura 72 夸脱大储物箱' }), null)
  // 认不出就是认不出,不编一个出来
  assert.equal(anchorOfItem({ name: '完全认不出的东西' }), null)
  assert.equal(anchorOfItem({ name: '' }), null)
}

// —— 类目按几何分配,不按柜名 ——
// 这是整个模块存在的理由:老的 resolveZone 拿线索词撞柜子名字,
// 名字对不上就落兜底区。几何不会。
{
  const plan = planStorageZones(home())
  const s1 = plan.zones.find((z) => z.code === 'S1')
  const s2 = plan.zones.find((z) => z.code === 'S2')
  const s3 = plan.zones.find((z) => z.code === 'S3')

  assert.ok(s1.ownedAnchors.includes('stove'), '灶边柜该拿下灶台')
  assert.ok(s2.ownedAnchors.includes('sink'), '水槽上柜该拿下水槽')
  assert.ok(s3.ownedAnchors.includes('pet'), '宠物架该拿下宠物区')
  assert.match(s1.spec.storagePlanZh, /锅具/)
  assert.match(s2.spec.storagePlanZh, /碗碟/)
  assert.match(s3.spec.storagePlanZh, /宠物/)
  // 每个类目自带自己的作业点和距离 —— 一个柜子拿下多个作业点时,
  // 「类目串 + 距离串」各自 join 会塌成读不断句的一堵墙(小户型实测触发)
  assert.match(s1.spec.storagePlanZh, /（灶台 [\d.]+ft）/, '类目要带着自己的作业点和距离')

  // 一个作业点只判给一个区 —— 否则厨房五个柜子会全都说自己该放锅
  const stoveOwners = plan.zones.filter((z) => z.ownedAnchors.includes('stove'))
  assert.equal(stoveOwners.length, 1, '灶台只该有一个主人')

  // 过肩的吊柜必须说「只放轻的」—— 这是全篇最要紧的一句「别放什么」
  assert.match(s2.spec.ergonomicsZh, /过肩/)
  assert.match(s2.spec.ergonomicsZh, /轻/)
  // 台面下柜落在黄金区
  assert.match(s1.spec.ergonomicsZh, /黄金区/)
}

// —— 轻的可以上吊柜,重的不行 ——
// 「过肩柜一律不当主力」是错的:碗碟是轻的,水槽上方的吊柜正是它们的教科书归宿。
// 但整袋米面放冰箱顶就是每次举过肩卸重物。区别在**类目的重量**,不在高度本身。
{
  const p = home()
  // 灶台边加一个吊柜,比台面下柜更近 —— 锅具是重类目,不该判给它
  p.placements.push({ id: 'pl-wall', kind: 'wall_cabinet', label: '灶上吊柜', x: ft(1), y: ft(3), w: ft(2), h: ft(1), rotation: 0 })
  p.storageZones.push({ id: 'z-w', code: 'S6', nameZh: '灶上吊柜', locationZh: '厨房', formZh: '吊柜', placementId: 'pl-wall', bounds: { x: ft(1), y: ft(3), w: ft(2), h: ft(1) }, marker: { x: 0, y: 0 }, items: [] })
  const plan = planStorageZones(p)
  const stoveOwner = plan.zones.find((z) => z.ownedAnchors.includes('stove'))
  assert.equal(stoveOwner.code, 'S1', '锅具是重的:该跳过更近的吊柜,给台面下柜')
  // 而碗碟(轻)照样归吊柜
  const sinkOwner = plan.zones.find((z) => z.ownedAnchors.includes('sink'))
  assert.equal(sinkOwner.code, 'S2', '碗碟是轻的:水槽上方的吊柜就是它该在的地方')
}

// 校对不许推翻规划自己刚说过的话 ——
// 实测踩到:气泡水机被送进冰箱顶吊柜(66–88″),而那个柜子的动线说明写着
// 「只放轻且不常用的,重物每次取放都要举过肩」。两句话直接打架。
{
  const p = home()
  p.placements.push({ id: 'pl-hi', kind: 'wall_cabinet', label: '冰箱顶柜', x: ft(20), y: ft(9), w: ft(2), h: ft(1), rotation: 0, attrs: { elevIn: 66, heightIn: 22 } })
  p.fixtures.push({ id: 'fx-fridge', kind: 'fridge', label: '冰箱', bounds: { x: ft(20), y: ft(10), w: ft(2), h: ft(2) } })
  p.storageZones.push({ id: 'z-hi', code: 'S7', nameZh: '冰箱顶柜', locationZh: '厨房', formZh: '吊柜', placementId: 'pl-hi', bounds: { x: ft(20), y: ft(9), w: ft(2), h: ft(1) }, marker: { x: 0, y: 0 }, items: [] })
  // 远处放一个够得着的柜子,让它有地方可去
  p.placements.push({ id: 'pl-lo', kind: 'cabinet', label: '食品柜', x: ft(17), y: ft(10), w: ft(2), h: ft(2), rotation: 0, attrs: { heightIn: 90 } })
  p.storageZones.push({ id: 'z-lo', code: 'S8', nameZh: '食品柜', locationZh: '厨房', formZh: '柜体', placementId: 'pl-lo', bounds: { x: ft(17), y: ft(10), w: ft(2), h: ft(2) }, marker: { x: 0, y: 0 }, items: [] })
  p.storageZones[0].items = [{ id: 'si-f', name: 'Breville 气泡水机' }]
  const plan = planStorageZones(p)
  const move = plan.misplaced.find((m) => m.itemId === 'si-f')
  if (move) assert.notEqual(move.toCode, 'S7', '重物不该被送进过肩的冰箱顶柜')
  // 干货(重类目)的主力位也该跳过冰箱顶柜
  const fridgeOwner = plan.zones.find((z) => z.ownedAnchors.includes('fridge'))
  assert.equal(fridgeOwner?.code, 'S8', '干货储备该给够得着的食品柜,不是冰箱顶')
}

// —— 距离要认墙 ——
// 直线距离穿墙。实测踩到:遮光窗帘被判给餐区的电视柜,理由是「离床 5.5ft」——
// 而床在卧室,那 5.5 英尺是穿墙量出来的。
{
  const p = home()
  // 三间:厨房(西) / 餐区(中,宠物架在这) / 卧室(东)
  const room = (id, nameZh, x0, x1) => ({
    id,
    nameZh,
    polygon: [{ x: ft(x0), y: 0 }, { x: ft(x1), y: 0 }, { x: ft(x1), y: ft(12) }, { x: ft(x0), y: ft(12) }],
  })
  p.zones = [room('r-k', '厨房', 0, 12), room('r-d', '餐区', 12, 24), room('r-b', '卧室', 24, 40)]
  // 床在卧室,但紧贴餐区那道墙 —— 直线上离餐区的宠物架(ft22)只有 5.7ft
  p.placements.push({ id: 'pl-bed', kind: 'bed', label: '床', x: ft(25), y: ft(4), w: ft(5), h: ft(6), rotation: 0 })
  // 卧室自己的柜子在里侧,直线上离床 9.7ft —— **比穿墙的那个远**。
  // 不认墙的话,床品会被判给餐区的宠物架;认墙才判给它。
  p.placements.push({ id: 'pl-bc', kind: 'cabinet', label: '卧室柜', x: ft(36), y: ft(4), w: ft(2), h: ft(2), rotation: 0, attrs: { heightIn: 36 } })
  p.storageZones.push({ id: 'z-bc', code: 'S9', nameZh: '卧室柜', locationZh: '卧室', formZh: '柜体', placementId: 'pl-bc', bounds: { x: ft(36), y: ft(4), w: ft(2), h: ft(2) }, marker: { x: 0, y: 0 }, items: [] })
  const plan = planStorageZones(p)
  const bedOwner = plan.zones.find((z) => z.ownedAnchors.includes('bed'))
  assert.equal(bedOwner?.code, 'S9', '床品该归卧室的柜子 —— 餐区那个的「近」是穿墙量的')
}

// 柜名完全误导时,几何照样判对 —— 名字是人随便起的
{
  const p = home()
  p.storageZones[0].nameZh = '杂物台'
  p.storageZones[0].locationZh = '随便什么地方'
  const plan = planStorageZones(p)
  const s1 = plan.zones.find((z) => z.code === 'S1')
  assert.ok(s1.ownedAnchors.includes('stove'), '叫「杂物台」也不影响:它就是离灶最近的那个')
}

// 拿不下作业点的区 = 备货位,要说清谁更近,而不是假装自己是主力
{
  const p = home()
  // 再加一个离灶更远的柜子
  p.placements.push({ id: 'pl-d', kind: 'cabinet', label: '远柜', x: ft(4), y: ft(8), w: ft(2), h: ft(2), rotation: 0, attrs: { heightIn: 36 } })
  p.storageZones.push({ id: 'z-d', code: 'S4', nameZh: '远柜', locationZh: '厨房', formZh: '柜体', placementId: 'pl-d', bounds: { x: ft(4), y: ft(8), w: ft(2), h: ft(2) }, marker: { x: 0, y: 0 }, items: [] })
  const plan = planStorageZones(p)
  const s4 = plan.zones.find((z) => z.code === 'S4')
  assert.equal(s4.ownedAnchors.length, 0, '远柜拿不下任何作业点')
  assert.match(s4.spec.storagePlanZh, /备货/)
  // 该点名**离它最近那个作业点的主人**,人才知道东西该先往哪放。
  // 别写死区号:远柜离水槽(7.3ft)其实比离灶台(7.6ft)近,写死 S1 是在断言一个假事实
  const s4Owner = plan.zones.find((z) => z.ownedAnchors.includes(s4.nearest[0].id))
  assert.ok(s4Owner, '它最近的作业点总该有个主人')
  assert.match(s4.spec.storagePlanZh, new RegExp(s4Owner.code), '该点名那个主人')
}

// —— 归位校对 ——
// 实测里那三件宠物用品就是这么占着厨房黄金位的
{
  const p = home()
  p.storageZones[0].items = [
    { id: 'si-1', name: 'PETLIBRO 8L 自动喂食器' },
    { id: 'si-2', name: 'Instant Pot 压力锅' },
  ]
  const plan = planStorageZones(p)
  const move = plan.misplaced.find((m) => m.itemId === 'si-1')
  assert.ok(move, '喂食器在灶边柜里,该被校对出来')
  assert.equal(move.fromCode, 'S1')
  assert.equal(move.toCode, 'S3', '该去宠物架')
  assert.ok(move.savedFt > 3, `该省下明显的路,got=${move.savedFt}`)
  // 压力锅本来就在对的地方,不该被报
  assert.ok(!plan.misplaced.some((m) => m.itemId === 'si-2'), '归位正确的不该报')
}

// 放错**房间**是最严重的一档,不能因为「算不出省多少英尺」就静默跳过。
// 加了认墙之后差点漏掉这一整类:跨房间时距离表里根本没有那个作业点,
// 原来的 `fromFt === undefined → continue` 会把它们全吞掉。
{
  const p = home()
  const room = (id, nameZh, x0, x1) => ({
    id,
    nameZh,
    polygon: [{ x: ft(x0), y: 0 }, { x: ft(x1), y: 0 }, { x: ft(x1), y: ft(12) }, { x: ft(x0), y: ft(12) }],
  })
  p.zones = [room('r-k', '厨房', 0, 12), room('r-d', '餐区', 12, 40)]
  // 卫浴收纳架待在餐区的宠物架上 —— 要用的时候得跨过整个屋子
  p.storageZones[2].items = [
    { id: 'si-b', name: '柜门上分层置物架', purchase: { title: 'Organizer for Bathroom, Under Sink Area' } },
  ]
  // 厨房那边放个洗手台,让 vanity 这个作业点存在
  p.fixtures.push({ id: 'fx-v', kind: 'vanity', label: '洗手台', bounds: { x: ft(1), y: ft(9), w: ft(2), h: ft(2) } })
  const plan = planStorageZones(p)
  const cross = plan.misplaced.find((m) => m.itemId === 'si-b')
  assert.ok(cross, '跨房间错放必须报出来 —— 它比同屋里放错柜子严重')
  assert.equal(cross.crossRoom, true)
  assert.equal(cross.savedFt, null, '跨房间没有「省多少英尺」这回事,别编一个数')
  assert.equal(cross.fromCode, 'S3')
  // 跨房间的排最前
  assert.equal(plan.misplaced[0].itemId, 'si-b')
}

// 差一两英尺不值得搬 —— 报出来只会让人来回折腾
{
  const p = home()
  // 两个柜子挨着,都在灶台边
  p.placements.push({ id: 'pl-e', kind: 'cabinet', label: '隔壁柜', x: ft(2), y: ft(6), w: ft(2), h: ft(1), rotation: 0, attrs: { heightIn: 36 } })
  p.storageZones.push({ id: 'z-e', code: 'S5', nameZh: '隔壁柜', locationZh: '厨房', formZh: '柜体', placementId: 'pl-e', bounds: { x: ft(2), y: ft(6), w: ft(2), h: ft(1) }, marker: { x: 0, y: 0 }, items: [{ id: 'si-9', name: '炒锅' }] })
  const plan = planStorageZones(p)
  assert.ok(!plan.misplaced.some((m) => m.itemId === 'si-9'), '只差一两英尺不值得搬')
}

// 容器不该被校对 —— 它们没有作业点,不是「放错了」
{
  const p = home()
  p.storageZones[0].items = [{ id: 'si-3', name: '13×13″ 布艺收纳箱' }]
  const plan = planStorageZones(p)
  assert.equal(plan.misplaced.length, 0, '收纳箱不该被判定放错')
}

// —— 按几何归区(resolveZone 的接班人) ——
{
  const p = home()
  assert.equal(resolveZoneByGeometry({ name: 'PETLIBRO 喂食器' }, p).code, 'S3')
  assert.equal(resolveZoneByGeometry({ name: 'Instant Pot 压力锅' }, p).code, 'S1')
  assert.equal(resolveZoneByGeometry({ name: '沥水碗碟架' }, p).code, 'S2')
  // 认不出作业点就老实返回 null,交给调用方兜底 ——
  // 关键区别:老的是「认不出柜名」就兜底,新的是「认不出这东西是干嘛的」才兜底
  assert.equal(resolveZoneByGeometry({ name: '完全认不出的东西' }, p), null)
  // 屋里没有这个作业点(没养狗)也返回 null,不硬塞
  const noPet = home()
  noPet.placements = noPet.placements.filter((x) => x.kind !== 'pet_crate')
  assert.equal(resolveZoneByGeometry({ name: 'PETLIBRO 喂食器' }, noPet), null)
}

// 暂存(导入还没安家)的家具不能当作业点 —— 它们全叠在画布左上角,
// 拿它们定位会把整份规划带到墙角去
{
  const p = home()
  p.placements.push({ id: 'pl-tray', kind: 'pet_crate', label: '狗笼', x: 24, y: 24, w: 40, h: 40, rotation: 0, attrs: { staged: true } })
  const hit = resolveZoneByGeometry({ name: 'PETLIBRO 喂食器' }, p)
  assert.equal(hit.code, 'S3', '暂存的狗笼不该把喂食器吸到画布左上角')
}

// —— 输入健壮性 ——
{
  for (const junk of [{}, { storageZones: [] }, { storageZones: null }]) {
    const plan = planStorageZones(junk)
    assert.ok(Array.isArray(plan.zones))
    assert.equal(plan.misplaced.length, 0)
  }
  // 没 bounds 的区进 unbound,不该让整份规划炸掉
  const p = home()
  p.storageZones.push({ id: 'z-x', code: 'S9', nameZh: '飘着的', locationZh: '', formZh: '柜体', items: [], marker: { x: 0, y: 0 } })
  const plan = planStorageZones(p)
  assert.ok(plan.unbound.includes('S9'))
  assert.ok(!plan.zones.some((z) => z.code === 'S9'))
}

// —— 容量门:功能性满载区不被当搬入目的地(规范 §6.3, 评审 B4)——
{
  const p = home()
  // 灶边柜 S1 是灶台最近的柜;把一口锅错放到远处宠物架 S3
  p.storageZones[2].items = [{ id: 'si-pot', name: 'Lodge 铸铁炒锅' }]
  // 基线:锅该被建议搬到 S1
  const base = planStorageZones(p)
  const baseMove = base.misplaced.find((m) => m.itemId === 'si-pot')
  assert.equal(baseMove?.toCode, 'S1', '基线:锅该归灶边柜')
  // 每个区都带结构化容量(默认 unknown,不伪造)
  assert.equal(base.zones.find((z) => z.code === 'S1').capacity.state, 'unknown')

  // 把 S1 标为用户确认的功能性满载 → 锅不再被塞进 S1(仍报 S1 为灶台归属)
  p.storageZones[0].capacityState = 'functional-full'
  p.storageZones[0].capacityEvidence = { source: 'user', at: '2026-07-16T00:00:00Z', reason: 'blocked-access' }
  const gated = planStorageZones(p)
  const move = gated.misplaced.find((m) => m.itemId === 'si-pot')
  if (move) assert.notEqual(move.toCode, 'S1', '满载区不该被当搬入目的地')
  assert.equal(gated.zones.find((z) => z.code === 'S1').capacity.state, 'functional-full')
  // S1 仍是灶台的归属(满载只是没空间,不改归属)
  assert.ok(gated.zones.find((z) => z.code === 'S1').ownedAnchors.includes('stove'))
}

// —— 宠物危险门:可触开放区里的危险物给出最近安全去处(规范 §4, 评审 B5)——
{
  const p = home()
  // S3(宠物架)设为开放可触;放一件药(危险)。灶边柜 S1 设为带门防护(安全去处)。
  p.storageZones[2].zoneAccess = { open: true, closable: false, petProof: false, lockable: false, heightCm: 20 }
  p.storageZones[2].items = [{ id: 'si-med', name: '布洛芬止痛药' }]
  p.storageZones[0].zoneAccess = { open: false, closable: true, petProof: true, lockable: true, heightCm: 20 }
  p.meta = { petSafety: { reachInCm: 90, canJumpToCounter: false, chews: true, opensCabinets: false } }
  const plan = planStorageZones(p)
  assert.ok(Array.isArray(plan.petHazards), '应有 petHazards')
  const hz = plan.petHazards.find((h) => h.itemId === 'si-med')
  assert.ok(hz, '可触区的药应报危险')
  assert.ok(hz.risks.includes('meds') && hz.risks.includes('toxic'), '药应多风险')
  assert.equal(hz.certainty, 'confirmed')
  assert.equal(hz.toCode, 'S1', '应指向最近的宠物安全区(带门防护柜)')
}

console.log('storage-plan-unit: ok')
