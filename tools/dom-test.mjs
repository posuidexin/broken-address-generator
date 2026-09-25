// 端到端 DOM 测试（jsdom）: node tools/dom-test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  url: 'http://localhost:8642/',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const { window } = dom;
const { document } = window;

// jsdom 缺少的 API 补齐
window.URL.createObjectURL = window.URL.createObjectURL || (() => 'blob:mock');
window.URL.revokeObjectURL = window.URL.revokeObjectURL || (() => {});
window.navigator.clipboard = { writeText: async () => {} };
window.confirm = () => true;
let toastMsgs = [];
let pageErrors = [];
window.addEventListener('error', (e) => pageErrors.push(e.message));
window.onerror = (m) => { pageErrors.push(String(m)); };
window.HTMLDivElement.prototype.scrollTo = () => {};

const run = (f) => window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));

// 捕获下载
let downloads = [];
const origCreate = window.URL.createObjectURL.bind(window.URL);
window.URL.createObjectURL = (blob) => {
  downloads.push({ mime: blob.type, text: blob.__text || '' });
  return 'blob:mock';
};
// Blob text 捕获: 包装 Blob 构造
const OrigBlob = window.Blob;
window.Blob = class extends OrigBlob {
  constructor(parts, opts) {
    super(parts, opts);
    this.__text = parts ? parts.join('') : '';
  }
};

// 加载数据 → 注入损坏存储 → 加载应用（测试容错）
for (const f of ['data/hk.js', 'data/us.js', 'data/sg.js', 'data/jp.js', 'js/generator.js']) {
  run(f);
}
window.localStorage.setItem('mockaddr_saved_v1', '{corrupted json!!');
window.localStorage.setItem('mockaddr_rl_v1', 'not-json');
run('js/app.js');

let fail = 0;
const check = (cond, msg) => { console.log(cond ? '  ✓ ' + msg : '  ✗ ' + msg); if (!cond) fail++; };
const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const clickGen = async () => {
  $('#generateBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(150);
};

console.log('== 初始化 ==');
await sleep(80);
check($('#regionSelect').options.length >= 19, `香港地区下拉已填充 (${$('#regionSelect').options.length} 项)`);
check($('#nowRegion').textContent === '香港 · 随机', `当前地区指示条初始值 (${$('#nowRegion').textContent})`);
check(document.querySelector('[data-country="hk"]').getAttribute('aria-pressed') === 'true' &&
  [...document.querySelectorAll('.cs-btn:not([data-country="hk"])')].every(b => b.getAttribute('aria-pressed') === 'false'),
  '国家切换初始选中状态可供辅助技术读取');
check($('#savedPanel').hidden, '损坏的收藏存储被安全回退（未崩溃）');
{
  const malformed = new JSDOM(html, { url: 'http://localhost:8642/', runScripts: 'outside-only' });
  malformed.window.eval(fs.readFileSync(path.join(ROOT, 'data/hk.js'), 'utf8'));
  malformed.window.eval(fs.readFileSync(path.join(ROOT, 'js/generator.js'), 'utf8'));
  malformed.window.localStorage.setItem('mockaddr_saved_v1', '[null]');
  try {
    malformed.window.eval(fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8'));
    check(malformed.window.document.querySelector('#savedPanel').hidden, '结构损坏的收藏记录被跳过');
  } catch (e) { check(false, `结构损坏的收藏导致启动失败: ${e.message}`); }
  malformed.window.close();
}

console.log('== 安全: 恶意 id 不导致选择器异常 ==');
{
  // 先收藏一条拿真实记录，再把删除按钮的 id 换成注入串
  $('#countInput').value = '1';
  await clickGen();
  document.querySelector('.addr-card .star').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(100);
  const delBtn = document.querySelector('.saved-item [data-del-id]');
  const evil = 'x"] body { } <img src=x onerror=alert(1)>';
  delBtn.setAttribute('data-del-id', evil);
  try {
    delBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
    await sleep(100);
    check(true, '注入式 id 删除操作未抛异常');
  } catch (e) {
    check(false, '注入式 id 导致异常: ' + e.message);
  }
  // 清理: 恢复收藏面板状态
  $('#clearSavedBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(100);
}

console.log('== 批量生成 5 条 ==');
$('#countInput').value = '5';
await clickGen();
check(document.querySelectorAll('.addr-card').length === 5, `生成 5 张卡片 (${document.querySelectorAll('.addr-card').length})`);
check($('#nowHint').textContent.startsWith('已生成 5 条'), `指示条提示更新 (${$('#nowHint').textContent})`);
check(!$('#results').classList.contains('single') || document.querySelectorAll('.addr-card.solo').length === 0, '多条时无 solo 放大');

console.log('== 收藏 ==');
const stars = document.querySelectorAll('.addr-card .star');
stars[0].dispatchEvent(new window.Event('click', { bubbles: true }));
stars[2].dispatchEvent(new window.Event('click', { bubbles: true }));
await sleep(100);
check($('#savedList').children.length === 2, `收藏列表 2 条 (${$('#savedList').children.length})`);
check(!$('#savedPanel').hidden, '收藏面板已显示');
check(stars[0].classList.contains('active') && stars[2].classList.contains('active'), '星标高亮状态正确');
const savedRaw = JSON.parse(window.localStorage.getItem('mockaddr_saved_v1'));
check(savedRaw.length === 2, `localStorage 持久化 2 条 (${savedRaw.length})`);
check(savedRaw[0].address && savedRaw[0].name, '持久化记录结构完整');

console.log('== 切换日本并批量生成 ==');
document.querySelector('[data-country="jp"]').dispatchEvent(new window.Event('click', { bubbles: true }));
check(document.querySelectorAll('.addr-card').length === 0 && !!$('#emptyHint'), '切换国家立即清除上一国家的结果');
check(document.querySelector('[data-country="jp"]').getAttribute('aria-pressed') === 'true' &&
  document.querySelector('[data-country="hk"]').getAttribute('aria-pressed') === 'false',
  '国家切换后选中状态同步更新');
await sleep(300);
const jpOpts = $('#regionSelect').options.length;
check(jpOpts === 48, `日本下拉 48 项 (随机+47县) (${jpOpts})`);
$('#regionSelect').value = '大阪府';
$('#regionSelect').dispatchEvent(new window.Event('change', { bubbles: true }));
await clickGen();
check($('#nowRegion').textContent === '日本 · 大阪府', `指示条跟随地区选择 (${$('#nowRegion').textContent})`);
check($('#nowFlag').textContent === '🇯🇵', '指示条国旗随国家切换');
if (pageErrors.length) console.log('  页面错误:', pageErrors.join(' | '));
const prefField = [...document.querySelectorAll('.addr-card .field')].find(f => f.textContent.startsWith('都道府县'));
check(prefField && !/[A-Za-z]/.test(prefField.textContent), `日本都道府县纯日文（无英文混排）: ${prefField ? prefField.textContent.slice(0, 15) : '未找到'}`);
const firstCard = document.querySelector('.addr-card');
check(!!firstCard, `日本卡片已渲染 (${document.querySelectorAll('.addr-card').length} 张)`);
if (!firstCard) process.exit(1);
const cardText = firstCard.textContent;
check(cardText.includes('大阪府'), `筛选大阪生效: ${cardText.split('\n')[0]}`);
check(cardText.includes('〒'), '日本地址含〒前缀');
check(document.querySelectorAll('.addr-card').length === 5, '切换国家后重新渲染 5 张');
// 收藏一张日本卡片供导出验证
document.querySelector('.addr-card .star').dispatchEvent(new window.Event('click', { bubbles: true }));
await sleep(100);

console.log('== 导出 CSV ==');
$('#exportCsvBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
await sleep(100);
const csvDl = downloads[0];
check(!!csvDl, 'CSV 下载已触发');
if (csvDl) {
  check(csvDl.text.startsWith('\uFEFF国家,地区,姓名,地址,邮编,手机'), 'CSV 表头正确（含 BOM）');
  const lines = csvDl.text.replace(/^\uFEFF/, '').trim().split('\r\n');
  check(lines.length === 4, `CSV 数据行 3 条 (${lines.length - 1})`);
  check(csvDl.text.includes('大阪府'), 'CSV 含日本记录');
}
$('#exportJsonBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
await sleep(100);
check(downloads.length === 2 && downloads[1].text.startsWith('['), 'JSON 导出成功');
$('#regionSelect').value = '東京都';
$('#regionSelect').dispatchEvent(new window.Event('change', { bubbles: true }));
check(document.querySelectorAll('.addr-card').length === 0 && !!$('#emptyHint'), '更换地区时清除旧筛选结果');

console.log('== 清空收藏 ==');
$('#clearSavedBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
await sleep(100);
check($('#savedList').children.length === 0 && $('#savedPanel').hidden, '清空后列表为空且面板隐藏');

console.log('== 手机号与纯本地字段（香港）==');
document.querySelector('[data-country="hk"]').dispatchEvent(new window.Event('click', { bubbles: true }));
await sleep(200);
await clickGen();
const fields = [...document.querySelectorAll('.addr-card .field')];
const mobileChip = fields.find(f => f.textContent.startsWith('手机'));
check(!!mobileChip && /\+852 [569]\d{3} \d{4}/.test(mobileChip.textContent), `香港手机号格式（可直贴）: ${mobileChip ? mobileChip.textContent.slice(2, 22) : '未找到'}`);
const streetChip = fields.find(f => f.textContent.startsWith('街道'));
check(!!streetChip && !/[A-Za-z]/.test(streetChip.textContent), `街道纯中文: ${streetChip ? streetChip.textContent.slice(0, 15) : '未找到'}`);
const zipChip = fields.find(f => f.textContent.startsWith('邮编'));
check(!zipChip, '香港结果不显示不存在的邮编');
const nameChip = fields.find(f => f.textContent.startsWith('姓名'));
check(!!nameChip && !/[A-Za-z()]/.test(nameChip.textContent), `姓名纯中文: ${nameChip ? nameChip.textContent.slice(2, 15) : '未找到'}`);

console.log('== 单条生成放大模式 ==');
$('#countInput').value = '1';
await clickGen();
check($('#results').classList.contains('single'), '单条时 results 容器加 single 类');
check(document.querySelector('.addr-card').classList.contains('solo'), '单条卡片加 solo 放大类');
check($('#nowHint').textContent.startsWith('已生成 1 条'), `指示条计数 (${$('#nowHint').textContent})`);

console.log('== 频率限制 ==');
// 种子: 本小时已用满 30 次生成
window.localStorage.setItem('mockaddr_rl_v1', JSON.stringify({
  events: Array.from({ length: 30 }, (_, i) => ({ ts: Date.now() - i * 1000, n: 5 }))
}));
const beforeCount = document.querySelectorAll('.addr-card').length;
await clickGen();
check(document.querySelectorAll('.addr-card').length === beforeCount, '达到次数上限后拒绝生成');
check($('#nowHint').textContent.includes('上限'), `提示含上限信息 (${$('#nowHint').textContent})`);
// 种子: 次数未满但条数将超限
window.localStorage.setItem('mockaddr_rl_v1', JSON.stringify({
  events: [{ ts: Date.now() - 5000, n: 599 }]
}));
$('#countInput').value = '5';
await clickGen();
check($('#nowHint').textContent.includes('上限'), '条数超限同样拒绝');
// 恢复配额后再生成应成功
window.localStorage.removeItem('mockaddr_rl_v1');
await clickGen();
check($('#nowHint').textContent.includes('已生成 5 条') && $('#nowHint').textContent.includes('剩余'), `配额恢复后可生成 (${$('#nowHint').textContent})`);
// 单次上限 50
$('#countInput').value = '999';
await clickGen();
check($('#nowHint').textContent.startsWith('已生成 50 条'), `单次上限截断为 50 (${$('#nowHint').textContent})`);

console.log('== 连续点击与异步切换 ==');
window.localStorage.setItem('mockaddr_rl_v1', JSON.stringify({
  events: Array.from({ length: 29 }, () => ({ ts: Date.now(), n: 1 }))
}));
let generated = 0;
const originalGenerate = window.MockAddr.generate;
window.MockAddr.generate = (...args) => { generated++; return originalGenerate(...args); };
$('#countInput').value = '50';
$('#generateBtn').click();
$('#generateBtn').click();
await sleep(150);
const quotaEvents = JSON.parse(window.localStorage.getItem('mockaddr_rl_v1')).events;
check(generated === 50 && quotaEvents.length === 30 && quotaEvents.reduce((n, e) => n + e.n, 0) === 79,
  '连续点击仅允许一个批次，配额记录与生成数一致');
window.MockAddr.generate = originalGenerate;
window.localStorage.removeItem('mockaddr_rl_v1');
$('#countInput').value = '1';
$('#generateBtn').click();
document.querySelector('[data-country="jp"]').click();
await sleep(150);
check(document.querySelectorAll('.addr-card').length === 0 && $('#nowRegion').textContent.startsWith('日本'),
  '切换国家后过期生成任务不会回填旧国家结果');

console.log('== 美国免州级销售税快捷筛选 ==');
document.querySelector('[data-country="us"]').click();
await sleep(150);
check(!$('#taxFreeShortcut').hidden && !$('#taxFreeNote').hidden, '美国模式显示醒目的快捷筛选与税务说明');
check($('#regionSelect').querySelector(`[value="${window.MockAddr.usNoStateSalesTaxValue}"]`) !== null,
  '州下拉提供免州级销售税选项');
$('#taxFreeShortcut').click();
check($('#regionSelect').value === window.MockAddr.usNoStateSalesTaxValue &&
  $('#taxFreeShortcut').getAttribute('aria-pressed') === 'true', '快捷按钮选中五州筛选');
$('#countInput').value = '10';
await clickGen();
check([...document.querySelectorAll('.addr-card .addr-line')].every(el => /, (AK|DE|MT|NH|OR) \d{5}$/.test(el.textContent)),
  '快捷筛选仅生成 AK/DE/MT/NH/OR 地址');
$('#taxFreeShortcut').click();
check($('#regionSelect').value === '' && document.querySelectorAll('.addr-card').length === 0,
  '再次点击快捷按钮恢复随机并清除旧结果');

console.log(fail === 0 ? '\n✅ DOM 端到端测试全部通过' : `\n❌ ${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
