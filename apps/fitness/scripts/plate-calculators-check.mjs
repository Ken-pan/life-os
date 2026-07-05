/**
 * plateLoading / plateLoadingNearest / equip mode 纯函数校验
 */
import {
  plateLoading,
  plateLoadingNearest,
  platesTotal,
  DEFAULT_BAR_LBS,
  isAllowedEquipMode,
  equipVariantsFor,
  recommendEquipMode,
  plateConfigFor,
  plateFormulaLine,
  plateSideExpanded
} from '../src/lib/tools/calculators.js';

const denoms = [45, 35, 25, 10, 5, 2.5];
let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error('✗', msg);
    failed++;
  }
}

// 225 = 45 杆 + 每侧 2×45
{
  const r = plateLoading(225, 45, { sides: 2, plates: denoms });
  assert(!r.error, '225 应可凑齐');
  assert(r.plates.join(',') === '45,45', `225 每侧应为 2×45，实际 ${r.plates}`);
  assert(r.verify === 225, `verify 应为 225，实际 ${r.verify}`);
}

// 185 = 45 杆 + 每侧 45+25
{
  const r = plateLoading(185, 45, { sides: 2, plates: denoms });
  assert(!r.error, '185 应可凑齐');
  assert(r.plates.join(',') === '45,25', `185 每侧应为 45+25，实际 ${r.plates}`);
}

// 卡箍计入双侧
{
  const r = plateLoading(230, 45, { sides: 2, plates: denoms, collar: 5 });
  assert(!r.error, '230 含卡箍 5 应可凑齐');
  assert(r.verify === 230, `verify 应为 230，实际 ${r.verify}`);
}

// 单端：调用方应传 collar:0
{
  const r = plateLoading(90, 0, { sides: 1, plates: denoms, collar: 0 });
  assert(!r.error, '地雷管 90 应可凑齐');
  assert(r.plates.join(',') === '45,45', `单端 90 应为 2×45，实际 ${r.plates}`);
  const polluted = plateLoading(90, 0, { sides: 1, plates: denoms, collar: 5 });
  assert(
    polluted.plates.join(',') !== '45,45',
    '单端误传卡箍会改变拆片结果，调用方须传 collar:0'
  );
}

// platesTotal 往返
{
  const plates = [45, 45];
  assert(platesTotal(plates, DEFAULT_BAR_LBS, 2) === 225, 'platesTotal 225');
}

// nearest
{
  const n = plateLoadingNearest(137, 45, { sides: 2, plates: denoms, collar: 0 });
  assert(n.under === 135, `137 较轻应为 135，实际 ${n.under}`);
}

// equip mode 白名单
{
  assert(isAllowedEquipMode('c_bench', 'smith'), '卧推应允许史密斯');
  assert(isAllowedEquipMode('c_bench', 'machine'), '卧推应允许器械');
  assert(!isAllowedEquipMode('c_bench', 'cable'), '卧推不应允许绳索');
  assert(!isAllowedEquipMode('l_ext', 'barbell'), '腿屈伸不应切换杠铃');
  const variants = equipVariantsFor({ id: 'c_bench' });
  assert(variants?.length === 3, '卧推应有 3 种加载方式');
}

// 史密斯拆片用 25 杆
{
  const cfg = plateConfigFor({ id: 'c_bench', equip: 'barbell' }, 'lbs', 'smith');
  assert(cfg?.defaultBar === 25, '史密斯默认杆应为 25');
  const line = plateFormulaLine(225, 25, [45, 45], { sides: 2 });
  assert(line === '225 = 25 杠 + (45 + 45) × 2', `公式应为史密斯格式，实际 ${line}`);
}

// 器械模式无凑片配置
{
  assert(plateConfigFor({ id: 'c_bench', equip: 'barbell' }, 'lbs', 'machine') === null, '器械模式不应有 plateConfig');
}

// 器械推荐
{
  const rec80 = recommendEquipMode({ id: 'c_bench', equip: 'barbell' }, 80, {});
  assert(rec80.equip === 'machine' && rec80.reason === 'weight', `80lb 卧推应推荐器械，实际 ${rec80.equip}/${rec80.reason}`);

  const rec185 = recommendEquipMode({ id: 'c_bench', equip: 'barbell' }, 185, {});
  assert(rec185.equip === 'barbell' && rec185.reason === 'weight', `185lb 卧推应推荐杠铃，实际 ${rec185.equip}/${rec185.reason}`);

  const recSaved = recommendEquipMode({ id: 'c_bench', equip: 'barbell' }, 80, {
    equipModes: { c_bench: 'smith' }
  });
  assert(recSaved.equip === 'smith' && recSaved.reason === 'saved', '应优先用户保存的加载方式');
}

// 展开装片展示
{
  assert(plateSideExpanded([45, 45]) === '45 + 45', '展开装片');
}

if (failed) {
  console.error(`\n${failed} 项失败`);
  process.exit(1);
}
console.log('✓ plate-calculators-check 全部通过');
