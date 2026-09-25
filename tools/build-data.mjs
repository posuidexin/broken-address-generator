#!/usr/bin/env node
/**
 * build-data.mjs — 一次性数据处理脚本（开发期使用，非运行时依赖）
 *
 * 数据来源：
 *  - 美国: rrad (github.com/EthanRBrown/rrad, 公有领域, 源自 OpenAddresses)
 *  - 日本: KEN_ALL UTF-8 镜像 (github.com/polm/posuto/raw, 源自日本邮政)
 *  - 新加坡: OneMap 全量邮编 (github.com/xkjyeah/singapore-postal-codes)
 *            + data.gov.sg HDB Property Information
 *
 * 用法: node tools/build-data.mjs [us|jp|sg|all]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache');
const DATA = path.join(ROOT, 'data');

/* ============================ 通用工具 ============================ */

function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function writeJSON(name, obj) {
  const out = path.join(DATA, name);
  fs.writeFileSync(out, JSON.stringify(obj));
  // 同步生成 .js 包装（file:// 协议下 fetch 不可用，用动态 <script> 加载）
  const jsName = name.replace(/\.json$/, '.js');
  fs.writeFileSync(path.join(DATA, jsName),
    'window.__ADDR_DATA__=window.__ADDR_DATA__||{};__ADDR_DATA__.' +
    name.replace(/\.json$/, '') + '=' + JSON.stringify(obj) + ';');
  const kb = (fs.statSync(out).size / 1024).toFixed(1);
  console.log(`✔ ${name} + ${jsName}  (${kb} KB)`);
}
function hashPick(arr, n, salt = '') {
  // 确定性采样：按名称哈希排序后取前 n 条，保证可复现且有随机感
  if (arr.length <= n) return arr;
  return [...arr].sort((a, b) => {
    const ha = crypto.createHash('md5').update(salt + JSON.stringify(a)).digest();
    const hb = crypto.createHash('md5').update(salt + JSON.stringify(b)).digest();
    return ha.compare(hb);
  }).slice(0, n);
}
// 简易 CSV 解析（处理双引号转义）
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* ============================ 日本: 假名→罗马字 ============================ */

const KANA_MAP_BASE = {
  ｱ: 'a', ｲ: 'i', ｳ: 'u', ｴ: 'e', ｵ: 'o',
  ｶ: 'ka', ｷ: 'ki', ｸ: 'ku', ｹ: 'ke', ｺ: 'ko',
  ｻ: 'sa', ｼ: 'shi', ｽ: 'su', ｾ: 'se', ｿ: 'so',
  ﾀ: 'ta', ﾁ: 'chi', ﾂ: 'tsu', ﾃ: 'te', ﾄ: 'to',
  ﾅ: 'na', ﾆ: 'ni', ﾇ: 'nu', ﾈ: 'ne', ﾉ: 'no',
  ﾊ: 'ha', ﾋ: 'hi', ﾌ: 'fu', ﾍ: 'he', ﾎ: 'ho',
  ﾏ: 'ma', ﾐ: 'mi', ﾑ: 'mu', ﾒ: 'me', ﾓ: 'mo',
  ﾔ: 'ya', ﾕ: 'yu', ﾖ: 'yo',
  ﾗ: 'ra', ﾘ: 'ri', ﾙ: 'ru', ﾚ: 're', ﾛ: 'ro',
  ﾜ: 'wa', ｦ: 'o', ﾝ: 'n',
};
const DAKU = { ｶ: 'ga', ｷ: 'gi', ｸ: 'gu', ｹ: 'ge', ｺ: 'go', ｻ: 'za', ｼ: 'ji', ｽ: 'zu', ｾ: 'ze', ｿ: 'zo', ﾀ: 'da', ﾁ: 'di', ﾂ: 'du', ﾃ: 'de', ﾄ: 'do', ﾊ: 'ba', ﾋ: 'bi', ﾌ: 'bu', ﾍ: 'be', ﾎ: 'bo' };
const HANDAKU = { ﾊ: 'pa', ﾋ: 'pi', ﾌ: 'pu', ﾍ: 'pe', ﾎ: 'po' };
const YOON_R = { ｬ: 'ya', ｭ: 'yu', ｮ: 'yo' };          // 普通拗音
const YOON_SH = { ｬ: 'a', ｭ: 'u', ｮ: 'o' };            // し/ち/じ 系拗音
const SMALL_VOWEL = { ｧ: 'a', ｨ: 'i', ｩ: 'u', ｪ: 'e', ｫ: 'o' };

function kanaToRomaji(s) {
  if (!s) return '';
  const chars = [...s];
  let out = '', i = 0;

  // 读一个音节基础音（含浊点/半浊点合并），返回 [romaji或null, 消耗字符数]
  const readSyllable = (j) => {
    const c = chars[j];
    if (!c) return [null, 0];
    if (chars[j + 1] === 'ﾞ' && DAKU[c]) return [DAKU[c], 2];
    if (chars[j + 1] === 'ﾟ' && HANDAKU[c]) return [HANDAKU[c], 2];
    return [KANA_MAP_BASE[c] ?? null, 1];
  };
  // 拗音前段（き/し/ち/に/ひ/み/り 及浊音）→ 输出辅音与音型
  const readYoonBase = (j) => {
    const c = chars[j];
    let b, len = 1;
    if (chars[j + 1] === 'ﾞ' && DAKU[c]) { b = DAKU[c]; len = 2; }
    else if (chars[j + 1] === 'ﾟ' && HANDAKU[c]) { b = HANDAKU[c]; len = 2; }
    else b = KANA_MAP_BASE[c];
    if (!b) return null;
    const map = { ki: 1, gi: 1, shi: 1, ji: 1, chi: 1, di: 1, ni: 1, hi: 1, bi: 1, pi: 1, mi: 1, ri: 1 };
    if (!map[b]) return null;
    return { base: b, len };
  };

  while (i < chars.length) {
    const c = chars[i];
    // 拗音: きゃ/きゅ/きょ/しゃ/ちゃ/じゃ 等
    const yb = readYoonBase(i);
    if (yb && chars[i + yb.len] && YOON_R[chars[i + yb.len]]) {
      const y = chars[i + yb.len];
      let base = yb.base, suffix;
      if (base === 'shi') { base = 'sh'; suffix = YOON_SH[y]; }
      else if (base === 'chi') { base = 'ch'; suffix = YOON_SH[y]; }
      else if (base === 'ji' || base === 'di') { base = 'j'; suffix = YOON_SH[y]; }
      else { base = base.slice(0, -1); suffix = YOON_R[y]; } // ki→k, ni→n...
      out += base + suffix;
      i += yb.len + 1;
      continue;
    }
    // 促音 ｯ: 双写下一音节辅音
    if (c === 'ｯ') {
      const nyb = readYoonBase(i + 1);
      const [nxt] = readSyllable(i + 1);
      let cons = null;
      if (nyb && chars[i + 1 + nyb.len] && YOON_R[chars[i + 1 + nyb.len]]) cons = nyb.base.slice(0, -1);
      else if (nxt) { const m = nxt.match(/^[^aiueon]+/); cons = m ? m[0] : null; }
      if (cons === 'ch' || cons === 'chi') cons = 't';
      else if (cons === 'sh' || cons === 'shi') cons = 's';
      out += cons || 't';
      i++;
      continue;
    }
    // 长音 ｰ: 重复前一个元音
    if (c === 'ｰ') {
      const lastV = out.slice(-1);
      if (/[aiueo]/.test(lastV)) out += lastV;
      i++;
      continue;
    }
    // 小元音: ファ→fa 之类
    if (SMALL_VOWEL[c]) {
      out = out.replace(/[aiueo]$/, SMALL_VOWEL[c]);
      i++;
      continue;
    }
    const [syllable, len] = readSyllable(i);
    out += syllable ?? c;
    i += Math.max(len, 1);
  }
  return out.replace(/n(?=[bmp])/g, 'm');
}

/* ============================ 日本: 静态表 ============================ */

const JP_PREF_ROMAJI = ['Hokkaido', 'Aomori', 'Iwate', 'Miyagi', 'Akita', 'Yamagata', 'Fukushima', 'Ibaraki', 'Tochigi', 'Gunma', 'Saitama', 'Chiba', 'Tokyo', 'Kanagawa', 'Niigata', 'Toyama', 'Ishikawa', 'Fukui', 'Yamanashi', 'Nagano', 'Gifu', 'Shizuoka', 'Aichi', 'Mie', 'Shiga', 'Kyoto', 'Osaka', 'Hyogo', 'Nara', 'Wakayama', 'Tottori', 'Shimane', 'Okayama', 'Hiroshima', 'Yamaguchi', 'Tokushima', 'Kagawa', 'Ehime', 'Kochi', 'Fukuoka', 'Saga', 'Nagasaki', 'Kumamoto', 'Oita', 'Miyazaki', 'Kagoshima', 'Okinawa'];
// 都道府県代码 → 代表市外局番
const JP_AREA_CODES = ['011', '017', '019', '022', '018', '023', '024', '029', '028', '027', '048', '043', '03', '045', '025', '076', '076', '0776', '055', '026', '058', '054', '052', '059', '077', '075', '06', '078', '0742', '073', '0857', '0852', '086', '082', '083', '088', '087', '089', '0888', '092', '0952', '095', '096', '097', '0985', '099', '098'];

const JP_NAMES = {
  surnames: [
    ['佐藤', 'サトウ', 'Sato'], ['鈴木', 'スズキ', 'Suzuki'], ['高橋', 'タカハシ', 'Takahashi'],
    ['田中', 'タナカ', 'Tanaka'], ['渡辺', 'ワタナベ', 'Watanabe'], ['伊藤', 'イトウ', 'Ito'],
    ['山本', 'ヤマモト', 'Yamamoto'], ['中村', 'ナカムラ', 'Nakamura'], ['小林', 'コバヤシ', 'Kobayashi'],
    ['加藤', 'カトウ', 'Kato'], ['吉田', 'ヨシダ', 'Yoshida'], ['山田', 'ヤマダ', 'Yamada'],
    ['佐々木', 'ササキ', 'Sasaki'], ['山口', 'ヤマグチ', 'Yamaguchi'], ['松本', 'マツモト', 'Matsumoto'],
    ['井上', 'イノウエ', 'Inoue'], ['木村', 'キムラ', 'Kimura'], ['林', 'ハヤシ', 'Hayashi'],
    ['斎藤', 'サイトウ', 'Saito'], ['清水', 'シミズ', 'Shimizu'], ['山崎', 'ヤマザキ', 'Yamazaki'],
    ['森', 'モリ', 'Mori'], ['阿部', 'アベ', 'Abe'], ['池田', 'イケダ', 'Ikeda'],
    ['橋本', 'ハシモト', 'Hashimoto'], ['石川', 'イシカワ', 'Ishikawa'], ['中島', 'ナカジマ', 'Nakajima'],
    ['小川', 'オガワ', 'Ogawa'], ['藤田', 'フジタ', 'Fujita'], ['岡田', 'オカダ', 'Okada'],
    ['後藤', 'ゴトウ', 'Goto'], ['長谷川', 'ハセガワ', 'Hasegawa'], ['村上', 'ムラカミ', 'Murakami'],
    ['近藤', 'コンドウ', 'Kondo'], ['石井', 'イシイ', 'Ishii'], ['前田', 'マエダ', 'Maeda'],
    ['藤井', 'フジイ', 'Fujii'], ['青木', 'アオキ', 'Aoki'], ['福田', 'フクダ', 'Fukuda'],
    ['西田', 'ニシダ', 'Nishida'], ['宮崎', 'ミヤザキ', 'Miyazaki'], ['松井', 'マツイ', 'Matsui']
  ],
  male: [
    ['太郎', 'タロウ', 'Taro'], ['健一', 'ケンイチ', 'Kenichi'], ['翔太', 'ショウタ', 'Shota'],
    ['大輔', 'ダイスケ', 'Daisuke'], ['健太', 'ケンタ', 'Kenta'], ['拓海', 'タクミ', 'Takumi'],
    ['陽翔', 'ハルト', 'Haruto'], ['蓮', 'レン', 'Ren'], ['悠人', 'ユウト', 'Yuto'],
    ['海斗', 'カイト', 'Kaito'], ['颯太', 'ソウタ', 'Sota'], ['雄太', 'ユウタ', 'Yuta'],
    ['直樹', 'ナオキ', 'Naoki'], ['修', 'オサム', 'Osamu'], ['一郎', 'イチロウ', 'Ichiro'],
    ['健二', 'ケンジ', 'Kenji'], ['涼介', 'リョウスケ', 'Ryosuke'], ['奏多', 'カナタ', 'Kanata'],
    ['丈', 'ジョウ', 'Jo'], ['亮', 'リョウ', 'Ryo']
  ],
  female: [
    ['花子', 'ハナコ', 'Hanako'], ['陽菜', 'ヒナ', 'Hina'], ['美咲', 'ミサキ', 'Misaki'],
    ['咲', 'サキ', 'Saki'], ['愛', 'アイ', 'Ai'], ['結衣', 'ユイ', 'Yui'],
    ['さくら', 'サクラ', 'Sakura'], ['美優', 'ミユ', 'Miyu'], ['杏', 'アン', 'An'],
    ['凛', 'リン', 'Rin'], ['美羽', 'ミウ', 'Miu'], ['陽葵', 'ヒマリ', 'Himari'],
    ['莉子', 'リコ', 'Riko'], ['千尋', 'チヒロ', 'Chihiro'], ['愛美', 'マナミ', 'Manami'],
    ['由紀', 'ユキ', 'Yuki'], ['智子', 'トモコ', 'Tomoko'], ['恵', 'メグミ', 'Megumi'],
    ['楓', 'カエデ', 'Kaede'], ['芽依', 'メイ', 'Mei']
  ]
};

/* ============================ 美国: 静态表 ============================ */

const US_STATE_NAMES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' };

const US_AREA_CODES = { AL: [205, 251, 256, 334, 938], AK: [907], AZ: [480, 520, 602, 623, 928], AR: [479, 501, 870], CA: [209, 213, 310, 323, 341, 408, 415, 510, 530, 559, 619, 626, 650, 657, 661, 669, 707, 714, 747, 760, 805, 818, 820, 831, 840, 858, 909, 916, 925, 949], CO: [303, 719, 720, 970, 983], CT: [203, 475, 860, 959], DE: [302], DC: [202], FL: [239, 305, 321, 352, 386, 407, 561, 689, 727, 754, 772, 786, 813, 850, 863, 904, 941, 954], GA: [229, 404, 470, 478, 678, 706, 762, 770, 912, 943], HI: [808], ID: [208, 986], IL: [217, 224, 309, 312, 331, 618, 630, 708, 773, 779, 815, 847, 872], IN: [219, 260, 317, 463, 574, 765, 812, 930], IA: [319, 515, 563, 641, 712], KS: [316, 620, 785, 913], KY: [270, 364, 502, 606, 859], LA: [225, 318, 337, 504, 985], ME: [207], MD: [227, 240, 301, 410, 443, 667], MA: [339, 351, 413, 508, 617, 774, 781, 857, 978], MI: [231, 248, 269, 313, 517, 586, 616, 679, 734, 810, 906, 947, 989], MN: [218, 320, 507, 612, 651, 763, 952], MS: [228, 601, 662, 769], MO: [235, 314, 417, 557, 573, 636, 660, 816, 975], MT: [406], NE: [308, 402, 531], NV: [702, 725, 775], NH: [603], NJ: [201, 551, 609, 640, 732, 848, 856, 862, 908, 973], NM: [505, 575], NY: [212, 315, 332, 347, 363, 516, 518, 585, 607, 631, 646, 680, 716, 718, 838, 845, 914, 917, 929, 934], NC: [252, 336, 472, 743, 828, 910, 919, 980, 984], ND: [701], OH: [216, 220, 234, 283, 326, 330, 380, 419, 436, 440, 513, 567, 614, 740, 937], OK: [405, 539, 572, 580, 918], OR: [458, 503, 541, 971], PA: [215, 223, 267, 272, 412, 445, 484, 570, 582, 610, 717, 724, 814, 878], RI: [401], SC: [803, 821, 839, 854, 864], SD: [605], TN: [423, 615, 629, 731, 865, 901, 931], TX: [210, 214, 254, 281, 325, 346, 361, 409, 430, 432, 469, 512, 682, 713, 726, 737, 806, 817, 830, 832, 903, 915, 936, 940, 945, 956, 972, 979], UT: [385, 435, 801], VT: [802], VA: [276, 434, 540, 571, 703, 757, 804, 826, 948], WA: [206, 253, 360, 425, 509, 564], WV: [304, 681], WI: [262, 274, 414, 534, 608, 715, 920, 943], WY: [307] };

const US_NAMES = {
  maleFirst: ['James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Charles', 'Christopher', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Steven', 'Andrew', 'Paul', 'Joshua', 'Kenneth', 'Kevin', 'Brian', 'George', 'Timothy', 'Ronald', 'Jason', 'Edward', 'Jeffrey', 'Ryan', 'Jacob', 'Gary', 'Nicholas', 'Eric', 'Jonathan', 'Stephen', 'Justin', 'Scott', 'Brandon', 'Benjamin', 'Samuel', 'Gregory', 'Alexander', 'Patrick', 'Jack', 'Dennis', 'Tyler', 'Aaron', 'Adam', 'Nathan', 'Henry', 'Zachary', 'Peter', 'Kyle', 'Noah', 'Ethan', 'Jeremy', 'Walter', 'Christian', 'Keith', 'Roger', 'Terry', 'Austin', 'Sean', 'Gerald', 'Carl', 'Dylan', 'Arthur', 'Jordan', 'Jesse', 'Bryan', 'Gabriel', 'Logan', 'Albert', 'Alan', 'Wayne', 'Elijah', 'Randy', 'Vincent', 'Ralph'],
  femaleFirst: ['Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen', 'Lisa', 'Nancy', 'Betty', 'Margaret', 'Sandra', 'Ashley', 'Dorothy', 'Kimberly', 'Emily', 'Donna', 'Michelle', 'Carol', 'Amanda', 'Melissa', 'Deborah', 'Stephanie', 'Rebecca', 'Laura', 'Sharon', 'Cynthia', 'Kathleen', 'Amy', 'Shirley', 'Angela', 'Helen', 'Anna', 'Brenda', 'Pamela', 'Nicole', 'Emma', 'Samantha', 'Katherine', 'Christine', 'Debra', 'Rachel', 'Catherine', 'Carolyn', 'Janet', 'Ruth', 'Maria', 'Heather', 'Diane', 'Victoria', 'Olivia', 'Kelly', 'Christina', 'Lauren', 'Joan', 'Evelyn', 'Judith', 'Megan', 'Andrea', 'Cheryl', 'Hannah', 'Jacqueline', 'Martha', 'Gloria', 'Teresa', 'Ann', 'Sara', 'Madison', 'Frances', 'Kathryn', 'Janice', 'Abigail', 'Alice', 'Julia', 'Sophia', 'Grace', 'Amber', 'Natalie', 'Charlotte'],
  last: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker', 'Cruz', 'Edwards', 'Collins', 'Reyes', 'Stewart', 'Morris', 'Morales', 'Murphy', 'Cook', 'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Cooper', 'Peterson', 'Bailey', 'Reed', 'Kelly', 'Howard', 'Ramos', 'Kim', 'Cox', 'Ward', 'Richardson', 'Watson', 'Brooks', 'Chavez', 'Wood', 'James', 'Bennett', 'Gray', 'Mendoza', 'Ruiz', 'Hughes', 'Price', 'Alvarez', 'Castillo', 'Sanders', 'Patel', 'Myers', 'Long', 'Ross', 'Foster', 'Jimenez']
};

/* ============================ 新加坡: 静态表 ============================ */

const SG_TOWN_CODES = { AMK: 'Ang Mo Kio', BD: 'Bedok', BB: 'Bukit Batok', BH: 'Bishan', BM: 'Bukit Merah', BP: 'Bukit Panjang', BT: 'Bukit Timah', CCK: 'Choa Chu Kang', CL: 'Clementi', CT: 'Central Area', GL: 'Geylang', HG: 'Hougang', JE: 'Jurong East', JW: 'Jurong West', KWN: 'Kallang', MP: 'Marine Parade', PG: 'Punggol', PRC: 'Pasir Ris', QT: 'Queenstown', SB: 'Sembawang', SGN: 'Serangoon', SK: 'Sengkang', TAP: 'Tampines', TG: 'Tengah', TP: 'Toa Payoh', WL: 'Woodlands', YS: 'Yishun' };

// HDB 街道缩写 → 全称（与 OneMap ROAD_NAME 对齐）
const SG_STREET_ABBR = {
  'STH': 'SOUTH', 'NTH': 'NORTH', 'AVE': 'AVENUE', 'ST': 'STREET', 'RD': 'ROAD',
  'DR': 'DRIVE', 'CTRL': 'CENTRAL', 'CRES': 'CRESCENT', 'TER': 'TERRACE',
  'LK': 'LINK', 'CL': 'CLOSE', 'GT': 'GATE', "C'WEALTH": 'COMMONWEALTH',
  'UP': 'UPPER', 'BT': 'BUKIT', 'JLN': 'JALAN', 'KG': 'KAMPONG', 'LOR': 'LORONG',
  'MKT': 'MARKET', 'PK': 'PARK', 'PL': 'PLACE', 'GDN': 'GARDENS', 'GDNS': 'GARDENS',
  'HTS': 'HEIGHTS', 'HT': 'HEIGHTS', 'CIR': 'CIRCUS', 'HWY': 'HIGHWAY', 'IND': 'INDUSTRIAL',
};
function sgNormalizeStreet(s) {
  return s.toUpperCase().replace(/[.'()]/g, '').split(/\s+/)
    .map(w => SG_STREET_ABBR[w] || w).join(' ')
    .replace(/\s+/g, ' ').trim();
}

const SG_NAMES = {
  cnSurname: ['Tan', 'Lim', 'Lee', 'Ong', 'Wong', 'Goh', 'Chua', 'Chan', 'Koh', 'Teo', 'Yeo', 'Ho'],
  cnMale: ['Wei Ming', 'Jun Jie', 'Kai Wen', 'Zhi Hao', 'Jun Feng', 'De Ming', 'Wei Ren', 'Jia Jun', 'Hao Ren', 'Wen Jie', 'Ming Xuan', 'Jun Le'],
  cnFemale: ['Hui Ling', 'Jia Yi', 'Xin Yi', 'Pei Shan', 'Yu Ting', 'Hui Min', 'Shi Ning', 'Jia Hui', 'Xuan Er', 'Mei Qi', 'Yi Xuan', 'Yun Ting'],
  myMale: ['Muhammad', 'Ahmad', 'Muhammad Amir', 'Farhan', 'Hafiz', 'Imran', 'Zul', 'Ridwan', 'Firdaus', 'Danial', 'Ilham', 'Syafiq'],
  myFemale: ['Nurul', 'Siti', 'Aisyah', 'Farah', 'Nur', 'Hidayah', 'Intan', 'Suria', 'Amirah', 'Diana', 'Shafiqah', 'Balqis'],
  myFather: ['Abdullah', 'Rahman', 'Hassan', 'Ibrahim', 'Yusof', 'Ismail', 'Omar', 'Salleh', 'Ahmad', 'Mohamed'],
  inMale: ['Arjun', 'Rajesh', 'Kumar', 'Vikram', 'Suresh', 'Ravi', 'Deepan', 'Karthik', 'Anand', 'Vijay', 'Sanjay', 'Prakash'],
  inFemale: ['Priya', 'Lakshmi', 'Anitha', 'Divya', 'Nisha', 'Kavitha', 'Meena', 'Shanti', 'Deepa', 'Rajeswari', 'Anjali', 'Sumithra'],
  inSurname: ['Kumar', 'Raj', 'Sharma', 'Nair', 'Menon', 'Pillai', 'Singh', 'Chandra', 'Iyer', 'Raman', 'Krishnan', 'Dass']
};

/* ============================ 处理器: 美国 ============================ */

// 常见街道名池（用于 rrad 未覆盖的州：真实城市+邮编 + 常见街道组合）
const US_STREET_POOL = [
  'Main Street', 'Oak Street', 'Maple Avenue', 'Cedar Lane', 'Elm Street',
  'Washington Avenue', 'Lake Drive', 'Hill Road', 'Park Place', 'Pine Street',
  'Sunset Boulevard', 'River Road', 'Church Street', 'High Street', 'Spring Street',
  'Willow Lane', 'Franklin Street', 'Meadow Lane', 'Chestnut Street', 'Juniper Court',
  'Dogwood Drive', 'Magnolia Street', 'Laurel Lane', 'Aspen Court', 'Birchwood Lane'
];

function buildUS() {
  const rrad = readJSON(path.join(CACHE, 'rrad-us-all.json'));
  const byState = {};
  for (const a of rrad.addresses) {
    const st = a.state;
    if (!st || !a.city || !a.address1) continue;
    // 运行时仅需街道、城市与邮编；不保留原始记录的精确经纬度。
    (byState[st] ??= []).push([a.address1, a.city, a.postalCode]);
  }
  // 全州城市+邮编（真实数据，补全 rrad 未覆盖的州）；按城市邮编数排序优先保留大城市
  const cityRows = readJSON(path.join(CACHE, 'us-zips.json'));
  const cityMap = new Map(); // st|CITY -> {city, zip, count}
  for (const r of cityRows) {
    const st = r.state;
    if (!US_STATE_NAMES[st]) continue;              // 仅 50 州 + DC
    const city = r.city, zip = String(r.zip_code).padStart(5, '0');
    if (!city || !/^\d{5}$/.test(zip)) continue;
    const key = st + '|' + city.toUpperCase();
    const entry = cityMap.get(key);
    if (entry) entry.count++;
    else cityMap.set(key, { st, city, zip, count: 1 });
  }
  const cityZips = {};
  for (const { st, city, zip } of [...cityMap.values()].sort((a, b) => b.count - a.count)) {
    (cityZips[st] ??= []).push([city, zip]);
  }
  for (const st of Object.keys(cityZips)) cityZips[st] = cityZips[st].slice(0, 80);

  const rradStates = Object.keys(byState).length;
  const allStates = Object.keys(cityZips).length;
  console.log(`美国: rrad 真实街道 ${rradStates} 州, 城市+邮编覆盖 ${allStates} 州/特区`);

  writeJSON('us.json', {
    meta: {
      source: 'rrad（OpenAddresses 衍生，公有领域，真实门牌）+ US-Zip-Codes-JSON（MIT, 真实城市与邮编全州覆盖）',
      note: 'rrad 覆盖州使用真实街道；其余州为真实城市+邮编配常见街道名，门牌随机'
    },
    states: Object.fromEntries(Object.entries(byState).map(([st, list]) => [st, hashPick(list, 400, 'us')])),
    cityZips,
    streets: US_STREET_POOL,
    stateNames: US_STATE_NAMES,
    areaCodes: US_AREA_CODES,
    names: US_NAMES
  });
}

/* ============================ 处理器: 日本 ============================ */

async function fetchGeoloniaCities() {
  // 都道府县 → { 市区町村名: 罗马字 }（失败返回空表，回退假名转换）
  const prefs = ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'];
  const out = {};
  let ok = 0;
  for (const p of prefs) {
    try {
      const r = await fetch(`https://japanese-addresses-v2.geoloniamaps.com/api/ja/${encodeURIComponent(p)}.json`);
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      out[p] = Object.fromEntries(j.data.map(c => [c.city, c.city_r]));
      ok++;
    } catch { out[p] = null; }
  }
  console.log(`geolonia 城市罗马字: ${ok}/47 都道府县获取成功`);
  return out;
}

async function buildJP() {
  const raw = fs.readFileSync(path.join(CACHE, 'ken_all.utf8.csv'), 'utf8');
  const rows = parseCSV(raw);
  const geo = await fetchGeoloniaCities();

  // 政令指定都市（市区町村名带市前缀）→ 市罗马字
  const DESIG_CITY_ROMAJI = { '札幌市': 'Sapporo-shi', '仙台市': 'Sendai-shi', 'さいたま市': 'Saitama-shi', '千葉市': 'Chiba-shi', '横浜市': 'Yokohama-shi', '川崎市': 'Kawasaki-shi', '相模原市': 'Sagamihara-shi', '新潟市': 'Niigata-shi', '静岡市': 'Shizuoka-shi', '浜松市': 'Hamamatsu-shi', '名古屋市': 'Nagoya-shi', '京都市': 'Kyoto-shi', '大阪市': 'Osaka-shi', '堺市': 'Sakai-shi', '神戸市': 'Kobe-shi', '岡山市': 'Okayama-shi', '広島市': 'Hiroshima-shi', '北九州市': 'Kitakyushu-shi', '福岡市': 'Fukuoka-shi', '熊本市': 'Kumamoto-shi' };
  // 政令指定都市各区罗马字（geolonia API 不含区名，静态补全）
  const DESIG_WARDS = {
    '札幌市': { '中央区': 'Chuo-ku', '北区': 'Kita-ku', '東区': 'Higashi-ku', '白石区': 'Shiroishi-ku', '豊平区': 'Toyohira-ku', '南区': 'Minami-ku', '西区': 'Nishi-ku', '厚別区': 'Atsubetsu-ku', '手稲区': 'Teine-ku', '清田区': 'Kiyota-ku' },
    '仙台市': { '青葉区': 'Aoba-ku', '宮城野区': 'Miyagino-ku', '若林区': 'Wakabayashi-ku', '太白区': 'Taihaku-ku', '泉区': 'Izumi-ku' },
    'さいたま市': { '西区': 'Nishi-ku', '北区': 'Kita-ku', '大宮区': 'Omiya-ku', '見沼区': 'Minuma-ku', '中央区': 'Chuo-ku', '桜区': 'Sakura-ku', '浦和区': 'Urawa-ku', '南区': 'Minami-ku', '緑区': 'Midori-ku', '岩槻区': 'Iwatsuki-ku' },
    '千葉市': { '中央区': 'Chuo-ku', '花見川区': 'Hanamigawa-ku', '稲毛区': 'Inage-ku', '若葉区': 'Wakaba-ku', '緑区': 'Midori-ku', '美浜区': 'Mihama-ku' },
    '横浜市': { '鶴見区': 'Tsurumi-ku', '神奈川区': 'Kanagawa-ku', '西区': 'Nishi-ku', '中区': 'Naka-ku', '南区': 'Minami-ku', '港南区': 'Konan-ku', '保土ケ谷区': 'Hodogaya-ku', '旭区': 'Asahi-ku', '磯子区': 'Isogo-ku', '金沢区': 'Kanazawa-ku', '港北区': 'Kohoku-ku', '緑区': 'Midori-ku', '青葉区': 'Aoba-ku', '都筑区': 'Tsuzuki-ku', '戸塚区': 'Totsuka-ku', '栄区': 'Sakae-ku', '泉区': 'Izumi-ku', '瀬谷区': 'Seya-ku' },
    '川崎市': { '川崎区': 'Kawasaki-ku', '幸区': 'Saiwai-ku', '中原区': 'Nakahara-ku', '高津区': 'Takatsu-ku', '多摩区': 'Tama-ku', '宮前区': 'Miyamae-ku', '麻生区': 'Asao-ku' },
    '相模原市': { '中央区': 'Chuo-ku', '南区': 'Minami-ku', '緑区': 'Midori-ku' },
    '新潟市': { '北区': 'Kita-ku', '東区': 'Higashi-ku', '中央区': 'Chuo-ku', '江南区': 'Konan-ku', '秋葉区': 'Akiha-ku', '南区': 'Minami-ku', '西区': 'Nishi-ku', '西蒲区': 'Nishikan-ku' },
    '静岡市': { '葵区': 'Aoi-ku', '駿河区': 'Suruga-ku', '清水区': 'Shimizu-ku' },
    '名古屋市': { '千種区': 'Chikusa-ku', '東区': 'Higashi-ku', '北区': 'Kita-ku', '西区': 'Nishi-ku', '中村区': 'Nakamura-ku', '中区': 'Naka-ku', '昭和区': 'Showa-ku', '瑞穂区': 'Mizuho-ku', '熱田区': 'Atsuta-ku', '中川区': 'Nakagawa-ku', '港区': 'Minato-ku', '南区': 'Minami-ku', '守山区': 'Moriyama-ku', '緑区': 'Midori-ku', '名東区': 'Meito-ku', '天白区': 'Tempaku-ku' },
    '京都市': { '北区': 'Kita-ku', '上京区': 'Kamigyo-ku', '左京区': 'Sakyo-ku', '中京区': 'Nakagyo-ku', '東山区': 'Higashiyama-ku', '下京区': 'Shimogyo-ku', '南区': 'Minami-ku', '右京区': 'Ukyo-ku', '伏見区': 'Fushimi-ku', '山科区': 'Yamashina-ku', '西京区': 'Nishikyo-ku' },
    '大阪市': { '都島区': 'Miyakojima-ku', '福島区': 'Fukushima-ku', '此花区': 'Konohana-ku', '西区': 'Nishi-ku', '港区': 'Minato-ku', '大正区': 'Taisho-ku', '天王寺区': 'Tennoji-ku', '浪速区': 'Naniwa-ku', '西淀川区': 'Nishiyodogawa-ku', '東淀川区': 'Higashiyodogawa-ku', '東成区': 'Higashinari-ku', '生野区': 'Ikuno-ku', '城東区': 'Joto-ku', '阿倍野区': 'Abeno-ku', '住之江区': 'Suminoe-ku', '住吉区': 'Sumiyoshi-ku', '東住吉区': 'Higashisumiyoshi-ku', '西成区': 'Nishinari-ku', '平野区': 'Hirano-ku', '北区': 'Kita-ku', '中央区': 'Chuo-ku' },
    '堺市': { '堺区': 'Sakai-ku', '中区': 'Naka-ku', '東区': 'Higashi-ku', '西区': 'Nishi-ku', '南区': 'Minami-ku', '北区': 'Kita-ku', '美原区': 'Mihara-ku' },
    '神戸市': { '東灘区': 'Higashinada-ku', '灘区': 'Nada-ku', '中央区': 'Chuo-ku', '兵庫区': 'Hyogo-ku', '北区': 'Kita-ku', '長田区': 'Nagata-ku', '須磨区': 'Suma-ku', '垂水区': 'Tarumi-ku', '西区': 'Nishi-ku' },
    '岡山市': { '北区': 'Kita-ku', '中区': 'Naka-ku', '東区': 'Higashi-ku', '南区': 'Minami-ku' },
    '広島市': { '中区': 'Naka-ku', '東区': 'Higashi-ku', '南区': 'Minami-ku', '西区': 'Nishi-ku', '安佐南区': 'Asaminami-ku', '安佐北区': 'Asakita-ku', '安芸南区': 'Akinami-ku', '安芸北区': 'Akikita-ku', '佐伯区': 'Saeki-ku' },
    '北九州市': { '門司区': 'Moji-ku', '若松区': 'Wakamatsu-ku', '戸畑区': 'Tobata-ku', '小倉北区': 'Kokurakita-ku', '小倉南区': 'Kokuraminami-ku', '八幡東区': 'Yahatahigashi-ku', '八幡西区': 'Yahatanishi-ku' },
    '福岡市': { '東区': 'Higashi-ku', '博多区': 'Hakata-ku', '中央区': 'Chuo-ku', '南区': 'Minami-ku', '西区': 'Nishi-ku', '城南区': 'Jonan-ku', '早良区': 'Sawara-ku' },
    '熊本市': { '中央区': 'Chuo-ku', '東区': 'Higashi-ku', '西区': 'Nishi-ku', '南区': 'Minami-ku', '北区': 'Kita-ku' }
  };

  const prefs = [];
  const prefIndex = new Map();
  const cityIndex = new Map();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 9) continue;
    const [, , zip, prefK, cityK, townK, pref, city, town] = r;
    if (!pref || !city || !zip || !/^\d{5,6}$/.test(r[0] || '')) continue;
    if (/以下に掲載がない場合|他に掲載|次の/.test(town)) {
      if (town !== '以下に掲載がない場合') continue;
    }
    const isNoTown = town === '以下に掲載がない場合';
    // 清理全/半角括号注释（如「○○（字沢、南平）」），含枚举顿号的町目整体跳过
    const cleanTown = isNoTown ? '' : town.replace(/[（(].*/s, '').replace(/[）)]+\s*$/, '').trim();
    if (!isNoTown && (!cleanTown || /[、，]/.test(cleanTown) || /[（(]/.test(cleanTown))) continue;
    if (/階/.test(town)) continue; // 单栋高层建筑的邮编行，不适合做町丁目

    // 都道府县（コード前2位）
    let pIdx = prefIndex.get(pref);
    if (pIdx === undefined) {
      pIdx = prefs.length;
      prefIndex.set(pref, pIdx);
      const codeNum = parseInt(r[0].slice(0, 2), 10);
      prefs.push({
        n: pref, k: prefK, r: JP_PREF_ROMAJI[codeNum - 1] || '',
        type: pref.endsWith('道') ? 'do' : pref.endsWith('都') ? 'to' : pref.endsWith('府') ? 'fu' : 'ken',
        ac: JP_AREA_CODES[codeNum - 1] || '03',
        cities: []
      });
    }
    const P = prefs[pIdx];

    // 市区町村
    let cKey = pref + '|' + city;
    let cIdx = cityIndex.get(cKey);
    if (cIdx === undefined) {
      cIdx = P.cities.length;
      cityIndex.set(cKey, cIdx);
      // 罗马字: 政令市「市+区」静态表 → geolonia 直查 → 假名转换
      let romaji = null;
      const dKeys = Object.keys(DESIG_CITY_ROMAJI).filter(d => city.startsWith(d));
      if (dKeys.length && DESIG_WARDS[dKeys[0]]?.[city.slice(dKeys[0].length)]) {
        romaji = DESIG_CITY_ROMAJI[dKeys[0]] + ' ' + DESIG_WARDS[dKeys[0]][city.slice(dKeys[0].length)];
      }
      if (!romaji) romaji = geo[pref]?.[city];
      if (!romaji) {
        romaji = dKeys.length
          ? DESIG_CITY_ROMAJI[dKeys[0]] + (city.slice(dKeys[0].length) ? ' ' + cap(kanaToRomaji(cityK.slice(dKeys[0].length))) : '')
          : cap(kanaToRomaji(cityK));
      }
      P.cities.push({ n: city, k: cityK, r: romaji, t: [] });
    }
    const C = P.cities[cIdx];
    // 町丁目（去重）
    const zip7 = zip.trim();
    if (C.t.some(t => t[0] === cleanTown && t[3] === zip7)) continue;
    C.t.push([cleanTown, isNoTown ? '' : townK.trim(), isNoTown ? '' : cap(kanaToRomaji(townK.trim())), zip7]);
  }

  // 采样控制体积: 每市区町村最多 12 个町丁目
  for (const P of prefs) {
    for (const C of P.cities) {
      if (C.t.length > 12) C.t = hashPick(C.t, 12, 'jp-town');
      C.t.sort((a, b) => a[0].localeCompare(b[0], 'ja'));
    }
    P.cities.sort((a, b) => a.n.localeCompare(b.n, 'ja'));
  }

  const totalTowns = prefs.reduce((s, p) => s + p.cities.reduce((x, c) => x + c.t.length, 0), 0);
  console.log(`日本: ${prefs.length} 都道府县, ${prefs.reduce((s, p) => s + p.cities.length, 0)} 市区町村, ${totalTowns} 町丁目`);

  writeJSON('jp.json', {
    meta: {
      source: '日本郵便 KEN_ALL（公开数据）+ geolonia 城市罗马字',
      note: '町目/邮编为真实数据，丁目/番/号为随机组合'
    },
    prefs, names: JP_NAMES,
    areaCodes: Object.fromEntries(prefs.map(p => [p.n, p.ac]))
  });
}
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s; }

/* ============================ 处理器: 新加坡 ============================ */

function buildSG() {
  const oneMap = readJSON(path.join(CACHE, 'sg-buildings.json'));
  const hdbRows = parseCSV(fs.readFileSync(path.join(CACHE, 'hdb.csv'), 'utf8'));
  const hdbHead = hdbRows.shift();

  // OneMap: 街区+街道 → 邮编（保留首个）
  const postalMap = new Map();
  for (const b of oneMap) {
    if (!b.POSTAL || !b.ROAD_NAME || !b.BLK_NO || b.BLK_NO === 'NIL') continue;
    const key = b.BLK_NO.toUpperCase() + '|' + sgNormalizeStreet(b.ROAD_NAME);
    if (!postalMap.has(key)) postalMap.set(key, { postal: b.POSTAL, road: b.ROAD_NAME });
  }

  // HDB: 街区 + 街道 → 城镇
  const towns = new Map(); // town -> Map(dedupeKey -> entry)
  let matched = 0, unmatched = 0;
  const unknownCodes = new Set();
  for (const r of hdbRows) {
    const [blk, street, , , residential] = r;
    const townCode = r[10];
    const town = SG_TOWN_CODES[townCode];
    if (!town) { unknownCodes.add(townCode); continue; }
    if (residential !== 'Y') continue;
    const key = blk.toUpperCase() + '|' + sgNormalizeStreet(street);
    const hit = postalMap.get(key);
    let entry;
    if (hit) { matched++; entry = [blk, hit.road, hit.postal]; }
    else { unmatched++; entry = [blk, street, null]; }
    if (!towns.has(town)) towns.set(town, new Map());
    const map = towns.get(town);
    const dedupeKey = entry[0].toUpperCase() + '|' + entry[1].toUpperCase();
    if (!map.has(dedupeKey)) map.set(dedupeKey, entry);
  }
  if (unknownCodes.size) console.log('未识别城镇代码:', [...unknownCodes].join(','));
  console.log(`新加坡 HDB 匹配: 邮编命中 ${matched}, 未命中 ${unmatched}（未命中记录不发布）`);

  // 仅采样 OneMap 中能核实街区、街道和邮编的组合。
  const townsOut = [];
  for (const [town, map] of towns) {
    const verified = [...map.values()].filter(e => e[2]);
    if (!verified.length) continue;
    const sample = hashPick(verified, 80, 'sg');
    townsOut.push({
      town,
      blocks: sample
    });
  }
  townsOut.sort((a, b) => a.town.localeCompare(b.town));

  // 地标/商业楼宇（增加多样性）；清理名称中的括号注释保证可直贴
  const BLACKLIST = /TEMPORARY|SITE OFFICE|NIL|CONSTRUCTION|WORKSITE|SUBSTATION|BLOCK \d+/;
  const cleanName = (s) => String(s).replace(/\s*[(（].*?[)）]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const landmarks = oneMap
    .filter(b => b.BUILDING && b.BUILDING !== 'NIL' && !BLACKLIST.test(b.BUILDING) && b.BLK_NO && b.BLK_NO !== 'NIL' && b.POSTAL)
    .map(b => [b.BLK_NO, b.ROAD_NAME, cleanName(b.BUILDING), b.POSTAL])
    .filter(e => e[2].length >= 4 && !/[（）()]/.test(e[2]));
  const landmarkSample = hashPick(landmarks, 300, 'sg-landmark');

  writeJSON('sg.json', {
    meta: {
      source: 'OneMap 邮编数据 + data.gov.sg HDB Property Information（政府开放数据）',
      note: '仅保留 OneMap 可核实的街区/街道/邮编组合，楼层与单元号随机'
    },
    towns: townsOut, landmarks: landmarkSample, names: SG_NAMES
  });
}

/* ============================ 入口 ============================ */

const which = process.argv[2] || 'all';
if (which === 'us' || which === 'all') buildUS();
if (which === 'sg' || which === 'all') buildSG();
if (which === 'jp' || which === 'all') await buildJP();
console.log('完成。');
