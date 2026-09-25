// 内容质检: 每国生成 100 条，格式断言 + 与源数据交叉验证
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis;
for (const f of ['hk.js', 'jp.js', 'us.js', 'sg.js', '../js/generator.js']) {
  new Function(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')).call(globalThis);
}
const D = globalThis.__ADDR_DATA__;
const M = globalThis.MockAddr;

let fail = 0, total = 0;
const errs = [];
function bad(rec, msg) { fail++; errs.push(`  ✗ [${rec.country}][${rec.id}] ${msg}\n    地址: ${rec.address.local}`); }

// 通用检查
function common(rec) {
  const texts = [rec.address.local, ...rec.fields.map(f => f.value), rec.name.local, rec.phone.intl];
  for (const t of texts) {
    if (t == null || /undefined|null|NaN/.test(String(t))) bad(rec, `异常值泄漏: ${t}`);
  }
  if (!rec.address.local || rec.address.local.length < 5) bad(rec, '地址为空或过短');
  if (/[（）()]/.test(rec.address.local)) bad(rec, '地址含括号注释');
  for (const f of rec.fields) if (/[（）()]/.test(f.value)) bad(rec, `字段${f.label}含括号: ${f.value}`);
}

// ===== 香港 =====
const hkStreetSet = new Map(); // district -> Set(street.zh), building -> Set
for (const d of D.hk.districts) {
  hkStreetSet.set(d.zh, new Set(d.streets.map(s => s.zh)));
  hkStreetSet.set(d.zh + '|b', new Set(d.buildings.map(b => b.zh)));
}
function checkHK(rec) {
  const v = Object.fromEntries(rec.fields.map(f => [f.key, f.value]));
  if (!/^(香港島|九龍|新界)/.test(rec.address.local)) bad(rec, '地址缺区域前缀');
  // 邮寄标准结构: 区域 + 街道門牌號 (+ 大廈) + 樓 + 室
  if (!/^(香港島|九龍|新界).+\d+號.*\d+樓[A-Z0-9]{1,3}室$/.test(rec.address.local)) bad(rec, `地址行结构异常: ${rec.address.local}`);
  if (rec.address.local.length > 60) bad(rec, `地址行超长: ${rec.address.local}`);
  if (!/^\d+樓/.test(v.unit)) bad(rec, `楼层格式: ${v.unit}`);
  if (!/室$/.test(v.unit)) bad(rec, `单元缺室: ${v.unit}`);
  if (rec.address.postal !== '' || 'postal' in v) bad(rec, '香港不应有邮编字段');
  const streets = hkStreetSet.get(v.district);
  if (!streets) bad(rec, `未知地区: ${v.district}`);
  else if (!streets.has(v.street)) bad(rec, `街道「${v.street}」不属于「${v.district}」(数据交叉验证失败)`);
  if (v.building && !hkStreetSet.get(v.district + '|b').has(v.building)) bad(rec, `大厦「${v.building}」不属于「${v.district}」`);
  if (!/^\+852 [569]\d{3} \d{4}$/.test(rec.phone.intl)) bad(rec, `手机格式: ${rec.phone.intl}`);
  if (!/^[\u4e00-\u9fff]{2,4}$/.test(rec.name.local)) bad(rec, `姓名非纯中文: ${rec.name.local}`);
}

// ===== 日本 =====
function checkJP(rec) {
  const v = Object.fromEntries(rec.fields.map(f => [f.key, f.value]));
  if (!/^〒\d{3}-\d{4} /.test(rec.address.local)) bad(rec, '地址缺〒邮编前缀');
  // 日本邮便标准结构: 〒邮编 + 行政区划 + 町目 + 番地
  if (!/^〒\d{3}-\d{4} .+\d{1,3}(-\d{1,4}){1,2}/.test(rec.address.local)) bad(rec, `地址行结构异常: ${rec.address.local.slice(0, 30)}`);
  if (rec.address.local.length > 70) bad(rec, `地址行超长: ${rec.address.local.length}`);
  if (!/^\d{3}-\d{4}$/.test(v.postal)) bad(rec, `邮编格式: ${v.postal}`);
  const P = D.jp.prefs.find(p => p.n === v.pref);
  if (!P) { bad(rec, `未知都道府县: ${v.pref}`); return; }
  const C = P.cities.find(c => c.n === v.city);
  if (!C) { bad(rec, `市区町村「${v.city}」不属于「${v.pref}」`); return; }
  if (v.town) {
    // KEN_ALL 中同名町目可对应多个邮编段（如「近永」798-1344/798-1345），任一配对成功即真实
    const zip7 = v.postal.replace('-', '');
    const matched = C.t.filter(t => t[0] === v.town);
    if (!matched.length) bad(rec, `町丁目「${v.town}」不属于「${v.city}」`);
    else if (!matched.some(t => t[3] === zip7)) bad(rec, `邮编与町目不匹配: ${v.town} 允许 ${matched.map(t => t[3].slice(0,3)+'-'+t[3].slice(3)).join('/')} 实际 ${v.postal}`);
  }
  if (!/^\d{1,3}(-\d{1,4}){1,2}$/.test(v.lot)) bad(rec, `番地格式: ${v.lot}`);
  const localBody = rec.address.local.split(' ')[1] || '';
  if (!localBody.startsWith(P.n + v.city)) bad(rec, `地址行行政拼接异常: ${localBody.slice(0, 20)}`);
  if (!/^\+81 (90|80|70) \d{4} \d{4}$/.test(rec.phone.intl)) bad(rec, `手机格式: ${rec.phone.intl}`);
}

// ===== 美国（信用卡账单/USPS 邮寄标准） =====
function checkUS(rec) {
  const v = Object.fromEntries(rec.fields.map(f => [f.key, f.value]));
  // 州字段必须是全名（账单表单标准），且能反查到两位州码
  const stCode = Object.keys(D.us.stateNames).find(k => D.us.stateNames[k] === v.state);
  if (!stCode) { bad(rec, `州字段不是全名: ${v.state}`); return; }
  if (!/^\d{5}$/.test(v.postal)) bad(rec, `邮编格式: ${v.postal}`);
  if (!v.city || v.city.length < 2) bad(rec, `城市异常: ${v.city}`);
  if (!/^\d+ /.test(v.street)) bad(rec, `街道格式: ${v.street}`);
  if (v.street.length > 50) bad(rec, `街道超长(USPS 建议≤46): ${v.street.length}`);
  if (rec.address.local.length > 100) bad(rec, `地址行超长: ${rec.address.local.length}`);
  // USPS 标准结构: 门牌街道(, 单元)?, 城市, 州码 邮编；单元指示符 Apt/Unit/Ste. 带空格或 # 紧贴
  if (!new RegExp(`^\\d+[^,]*(, ((Apt|Unit|Ste\\.) [0-9A-Z]+|#[0-9A-Z]+))?, ${v.city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, ${stCode} ${v.postal}$`).test(rec.address.local))
    bad(rec, `地址行非 USPS 标准结构: ${rec.address.local}`);
  if (v.apt && !/^((Apt|Unit|Ste\.) [0-9A-Z]+|#[0-9A-Z]+)$/.test(v.apt)) bad(rec, `单元非标准指示符: ${v.apt}`);
  // 交叉验证: rrad 州应命中真实街道; 合成州城市+邮编必须成对存在于源数据
  const rradList = D.us.states[stCode];
  if (rradList && rradList.length) {
    if (!rradList.some(e => e[0] === v.street && e[1] === v.city)) bad(rec, `rrad 州未命中真实街道: ${v.street}`);
  } else {
    const cz = D.us.cityZips[stCode] || [];
    if (!cz.some(e => e[0] === v.city && e[1] === v.postal)) bad(rec, `城市邮编配对不存在于源数据: ${v.city}/${v.postal} (真实性校验失败)`);
  }
  if (!/^\+1 \d{3} \d{3} \d{4}$/.test(rec.phone.intl)) bad(rec, `手机格式: ${rec.phone.intl}`);
  const area = parseInt(rec.phone.intl.split(' ')[1], 10);
  if (!(D.us.areaCodes[stCode] || []).includes(area)) bad(rec, `区号 ${area} 不属于 ${stCode}`);
  const exch = rec.phone.intl.split(' ')[2];
  if (exch[1] === '1' && exch[2] === '1') bad(rec, `局号为 X11 特种号码: ${rec.phone.intl}`);
}

// ===== 新加坡 =====
const sgAll = new Map(); // "blk|STREET" -> postal
for (const t of D.sg.towns) for (const b of t.blocks) sgAll.set(`${b[0]}|${b[1]}`, b[2]);
const sgLandmarks = new Set(D.sg.landmarks.map(l => `${l[0]}|${l[1]}|${l[2]}|${l[3]}`));
// 核对全部发布记录与原始 OneMap 数据，不能只和生成后的数据自我对照。
const sgSource = JSON.parse(fs.readFileSync(path.join(ROOT, '.cache/sg-buildings.json'), 'utf8'));
const sgSourcePostals = new Map();
for (const b of sgSource) {
  if (!b.BLK_NO || !b.ROAD_NAME || !b.POSTAL) continue;
  const key = `${b.BLK_NO.toUpperCase()}|${b.ROAD_NAME.toUpperCase()}`;
  if (!sgSourcePostals.has(key)) sgSourcePostals.set(key, new Set());
  sgSourcePostals.get(key).add(b.POSTAL);
}
let verifiedSGBlocks = 0;
for (const t of D.sg.towns) for (const [blk, street, postal] of t.blocks) {
  if (!sgSourcePostals.get(`${blk.toUpperCase()}|${street.toUpperCase()}`)?.has(postal)) {
    fail++;
    errs.push(`  ✗ [sg][dataset] OneMap 无法核实: ${t.town} ${blk} ${street} ${postal}`);
  } else verifiedSGBlocks++;
}
console.log(`新加坡住宅街区原始数据核实: ${verifiedSGBlocks}/${D.sg.towns.reduce((n, t) => n + t.blocks.length, 0)}`);
function checkSG(rec) {
  const v = Object.fromEntries(rec.fields.map(f => [f.key, f.value]));
  if (!/^\d{6}$/.test(v.postal)) bad(rec, `邮编格式: ${v.postal}`);
  // SingPost 官方格式: Blk N STREET / N STREET, #楼层-单元, Singapore 邮编
  if (!/^(Blk [0-9A-Z]+ )?[0-9A-Z'.\- ]+, #\d{2}-\d{3}, Singapore \d{6}$/.test(rec.address.local)) bad(rec, `地址行非 SingPost 结构: ${rec.address.local}`);
  if (!/^#\d{2}-\d{3}$/.test(v.unit)) bad(rec, `单元格式: ${v.unit}`);
  if (!/^Blk /.test(rec.address.local) && !v.building) bad(rec, `非地标却缺 Blk 前缀: ${rec.address.local.slice(0, 20)}`);
  if (v.building) {
    if (!sgLandmarks.has(`${v.blk}|${v.street}|${v.building}|${v.postal}`)) bad(rec, `地标记录与源数据不符: ${v.building}`);
  } else {
    const src = sgAll.get(`${v.blk}|${v.street}`);
    if (!src) bad(rec, `街区+街道不存在于源数据: ${v.blk} ${v.street}`);
    else if (src !== v.postal) bad(rec, `街区邮编与源数据不符: ${v.blk}/${v.street} 应为 ${src} 实际 ${v.postal} (真实性校验失败)`);
  }
  if (!/^\+65 [89]\d{3} \d{4}$/.test(rec.phone.intl)) bad(rec, `手机格式: ${rec.phone.intl}`);
}

/* ================= 执行 ================= */
const CHECKERS = { hk: checkHK, jp: checkJP, us: checkUS, sg: checkSG };
const LABEL = { hk: '香港', jp: '日本', us: '美国', sg: '新加坡' };
const N = 100;
const regions = {};

for (const c of ['hk', 'jp', 'us', 'sg']) {
  console.log(`\n===== ${LABEL[c]} × ${N} =====`);
  for (let i = 0; i < N; i++) {
    const rec = M.generate(c, D[c], { phoneType: 'mobile' });
    total++;
    regions[c] ??= {};
    regions[c][rec.region] = (regions[c][rec.region] || 0) + 1;
    common(rec);
    CHECKERS[c](rec);
  }
  const regionCount = Object.keys(regions[c]).length;
  console.log(`  覆盖 ${regionCount} 个不同区域, 样例:`);
  for (let i = 0; i < 3; i++) {
    const r = M.generate(c, D[c], { phoneType: 'mobile' });
    console.log(`   · ${r.address.local}  |  ${r.name.local}  |  ${r.phone.intl}`);
  }
}

console.log(`\n========== 质检结果 ==========`);
console.log(`共检查 ${total} 条, 发现 ${fail} 处问题`);
if (errs.length) console.log(errs.slice(0, 30).join('\n'));
else console.log('✅ 全部通过：格式正确 + 与源数据交叉验证一致');
process.exit(fail ? 1 : 0);
