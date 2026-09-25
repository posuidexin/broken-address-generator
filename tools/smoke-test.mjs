// 冒烟测试: node tools/smoke-test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis;

// 按顺序加载 data/*.js 与 generator.js
for (const f of ['hk.js', 'jp.js', 'us.js', 'sg.js', '../js/generator.js']) {
  const code = fs.readFileSync(path.join(ROOT, 'data', f), 'utf8');
  new Function(code).call(globalThis);
}
const D = globalThis.__ADDR_DATA__;
const M = globalThis.MockAddr;

let fail = 0;
const check = (cond, msg) => { if (!cond) { console.error('  ✗', msg); fail++; } };

for (const country of ['hk', 'jp', 'us', 'sg']) {
  console.log(`\n===== ${country.toUpperCase()} =====`);
  for (let i = 0; i < 3; i++) {
    const r = M.generate(country, D[country], { phoneType: i === 0 ? 'mobile' : 'landline' });
    console.log(`[${r.region}] ${r.name.display}  ${r.phone.display}`);
    console.log('  本地:', r.address.local);
    if (r.address.en !== r.address.local) console.log('  英文:', r.address.en);
    console.log('  字段:', r.fields.map(f => `${f.label}=${f.value}`).join(' | '));
    check(r.address.local && r.address.local.length > 5, '本地地址为空');
    check(r.name && r.name.display, '姓名为空');
    check(r.phone && r.phone.number && r.phone.intl, '电话为空');
    if (country === 'jp') {
      check(/^\d{3}-\d{4}$/.test(r.address.postal), `日本邮编格式: ${r.address.postal}`);
      check(r.address.local.startsWith('〒'), '日本地址缺〒前缀');
    }
    if (country === 'sg') check(/^\d{6}$/.test(r.address.postal), `新加坡邮编格式: ${r.address.postal}`);
    if (country === 'us') check(/^\d{5}(-\d{4})?$/.test(r.address.postal), `美国邮编格式: ${r.address.postal}`);
    if (country === 'hk') {
      check(r.address.local.includes('樓'), '香港地址缺楼层');
      check(r.address.postal === '' && !r.fields.some(f => f.key === 'postal'), '香港不得生成邮编');
    }
  }
}

// 区域筛选测试
console.log('\n===== 区域筛选 =====');
const cases = [
  ['jp', { pref: '東京都' }], ['hk', { district: '油尖旺區' }],
  ['us', { state: 'CA' }], ['sg', { town: 'Bedok' }]
];
for (const [c, opts] of cases) {
  const r = M.generate(c, D[c], opts);
  console.log(`${c} 筛选 → [${r.region}]`, r.address.local.slice(0, 50));
  if (c === 'us') {
    check(r.region === 'California', `美国区域应显示州全名: ${r.region}`);
    check(r.address.local.includes(', CA '), `美国地址行应含州码: ${r.address.local}`);
  } else {
    check(r.region.includes(Object.values(opts)[0].replace('區', '')) || r.region === Object.values(opts)[0] || r.address.local.includes(Object.values(opts)[0]), `区域筛选失效: ${c}`);
  }
}
for (const c of ['jp', 'hk', 'us', 'sg']) {
  const n = M.regionOptions(c, D[c]).length;
  console.log(`${c} 区域选项: ${n}`);
  check(n > 0, `${c} 无区域选项`);
}

// 审计A: 可直贴性 — 字段值与地址行不含括号注释/中英混排
console.log('\n===== 可直贴性审计 =====');
for (const c of ['hk', 'jp', 'us', 'sg']) {
  for (let i = 0; i < 20; i++) {
    const r = M.generate(c, D[c], { phoneType: 'mobile' });
    for (const f of r.fields) check(!/[（）()]/.test(f.value), `${c} 字段「${f.label}」含括号: ${f.value}`);
    check(!/[（）()]/.test(r.address.local), `${c} 地址行含括号: ${r.address.local}`);
    check(!/\s{2,}/.test(r.address.local), `${c} 地址行含连续空格`);
  }
}

// 审计B: 美国全州覆盖（50 州 + DC = 51）与免州级销售税快捷筛选
console.log('\n===== 美国州覆盖 =====');
const usOptions = M.regionOptions('us', D.us);
check(usOptions.length === 52, `美国区域选项应为 51 州/特区 + 1 快捷筛选，实际 ${usOptions.length}`);
check(usOptions[0]?.value === M.usNoStateSalesTaxValue, '免州级销售税选项应置顶');
const noStateSalesTax = new Set(['AK', 'DE', 'MT', 'NH', 'OR']);
for (let i = 0; i < 100; i++) {
  const r = M.generate('us', D.us, { state: M.usNoStateSalesTaxValue });
  const st = r.address.local.match(/, ([A-Z]{2}) \d{5}$/)?.[1];
  check(noStateSalesTax.has(st), `快捷筛选生成了非目标州: ${r.address.local}`);
}
for (const st of ['AK', 'HI', 'WY', 'FL', 'TX', 'DC', 'ME', 'NM']) {
  const r = M.generate('us', D.us, { state: st });
  check(/^\d{5}$/.test(r.address.postal), `${st} 邮编5位: ${r.address.postal}`);
  check(r.fields.find(f => f.key === 'city')?.value?.length > 1, `${st} 城市非空`);
  check(/^(rrad|\d{2,4}\s)/.test('') || r.address.local.includes(','), `${st} 地址格式: ${r.address.local}`);
  console.log(`  ${st}: ${r.address.local}`);
}
// 日本市区町村完整性: 47 都道府县全部有城市
const jpAllCities = D.jp.prefs.every(p => p.cities.length > 0);
check(jpAllCities, '日本存在无城市的都道府县');
console.log(`日本市区町村总数: ${D.jp.prefs.reduce((s, p) => s + p.cities.length, 0)}`);
check(D.hk.districts.length === 18, `香港 18 区: ${D.hk.districts.length}`);
check(D.sg.towns.length >= 24, `新加坡市镇: ${D.sg.towns.length}`);

console.log(fail === 0 ? '\n✅ 全部通过' : `\n❌ ${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
