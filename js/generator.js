/* ============================================================
 * MockAddr 核心生成器 — 纯函数，无外部依赖
 * 街道/城镇及适用地区的邮编取自真实公开数据，门牌/楼层/单元号随机组合
 * ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 通用工具 ---------- */
  const ri = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance = (p) => Math.random() < p;
  const pad = (n, w) => String(n).padStart(w, '0');
  let _seq = 0;
  const uid = () => Date.now().toString(36) + '-' + (++_seq).toString(36);

  /* ---------- 日本楼宇名 ---------- */
  const JP_BUILDING_JP = ['パークハイツ', 'サンライズマンション', 'グランドメゾン', '〇〇ハイツ', 'コーポ青葉', 'アーバンハイツ', '〇〇荘', 'エクセルシオン'];
  const JP_BUILDING_SPOT_JP = ['若葉', '緑苑', '青空', 'ひまわり', '第二緑町', 'サンスクエア', 'ベルテ', 'アゼリア', 'ルネス', 'ヴェルディ'];
  const JP_BUILDING_EN = ['Park Heights', 'Sunrise Mansions', 'Grand Maison', 'Heights', 'Aoba Copo', 'Urban Heights', 'Soan', 'Excelsior'];
  const JP_BUILDING_SPOT_EN = ['Wakaba', 'Ryokuen', 'Aozora', 'Himawari', 'Daini-Midori', 'Sun Square', 'Berte', 'Azeria', 'Renes', 'Verdi'];

  /* ---------- 新加坡单元 / 电话等 ---------- */

  /* ============================================================
   * 电话生成
   * ============================================================ */
  function phoneJP(data, pref, type) {
    const digits = (n) => Array.from({ length: n }, () => ri(0, 9)).join('');
    if (type === 'mobile') {
      const prefix = pick(['090', '080', '070']);
      const rest = digits(8);
      const number = `${prefix}-${rest.slice(0, 4)}-${rest.slice(4)}`;
      return { number, intl: '+81 ' + number.replace(/^0/, '').replace(/-/g, ' ') };
    }
    const area = data.areaCodes[pref] || '03';
    const len = area.length;
    const rest = digits(len === 2 ? 8 : len === 3 ? 7 : 6);
    const number = len === 2
      ? `${area}-${rest.slice(0, 4)}-${rest.slice(4)}`
      : len === 3 ? `${area}-${rest.slice(0, 3)}-${rest.slice(3)}`
        : `${area}-${rest.slice(0, 2)}-${rest.slice(2)}`;
    return { number, intl: '+81 ' + number.replace(/^0/, '').replace(/-/g, ' ') };
  }

  function phoneHK(type) {
    const prefix = type === 'mobile' ? pick(['5', '6', '9']) : pick(['2', '3']);
    const n = prefix + pad(ri(0, 9999999), 7);
    return { number: `${n.slice(0, 4)} ${n.slice(4)}`, intl: `+852 ${n.slice(0, 4)} ${n.slice(4)}` };
  }

  function phoneSG() {
    const n = pick(['8', '9']) + pad(ri(0, 9999999), 7);
    return { number: `${n.slice(0, 4)} ${n.slice(4)}`, intl: `+65 ${n.slice(0, 4)} ${n.slice(4)}` };
  }

  function phoneUS(data, state) {
    const codes = (data.areaCodes[state] || ['212']);
    const area = pick(codes);
    // NANP: 局号首位 2-9，避开 N11（911/411 等特种号码）
    let exch;
    do { exch = `${ri(2, 9)}${ri(0, 9)}${ri(0, 9)}`; } while (exch[1] === '1' && exch[2] === '1');
    const sub = pad(ri(0, 9999), 4);
    return { number: `(${area}) ${exch}-${sub}`, intl: `+1 ${area} ${exch} ${sub}` };
  }

  /* ============================================================
   * 姓名生成
   * ============================================================ */
  function nameJP(names) {
    const s = pick(names.surnames), g = pick(Math.random() < 0.5 ? names.male : names.female);
    return {
      gender: names.male.includes(g) ? '男' : '女',
      kanji: s[0] + g[0], kana: s[1] + g[1], romaji: `${s[2]} ${g[2]}`
    };
  }

  function nameHK(data) {
    const s = pick(data.surnames);
    const isMale = chance(0.5);
    const g = pick(isMale ? data.maleNames : data.femaleNames);
    const roman = `${s.roman} ${g.roman}`;
    const enPool = isMale ? data.englishNamesMale : data.englishNamesFemale;
    const hasEn = enPool && enPool.length && chance(0.4);
    return {
      gender: isMale ? '男' : '女',
      zh: s.zh + g.zh,
      roman,
      en: hasEn ? `${pick(enPool)} ${s.roman}` : roman
    };
  }

  function nameUS(names) {
    const isMale = chance(0.5);
    const first = pick(isMale ? names.maleFirst : names.femaleFirst);
    const last = pick(names.last);
    return { gender: isMale ? '男' : '女', full: `${first} ${last}`, first, last };
  }

  function nameSG(names) {
    const roll = Math.random();
    if (roll < 0.55) { // 华族
      const isMale = chance(0.5);
      return {
        race: '华人', gender: isMale ? '男' : '女',
        full: `${pick(names.cnSurname)} ${pick(isMale ? names.cnMale : names.cnFemale)}`
      };
    }
    if (roll < 0.78) { // 马来族
      const isMale = chance(0.5);
      const first = pick(isMale ? names.myMale : names.myFemale);
      const father = pick(names.myFather);
      return {
        race: '马来族', gender: isMale ? '男' : '女',
        full: `${first} ${isMale ? 'bin' : 'binti'} ${father}`
      };
    }
    const isMale = chance(0.5); // 印族
    return {
      race: '印度族', gender: isMale ? '男' : '女',
      full: `${pick(isMale ? names.inMale : names.inFemale)} ${pick(names.inSurname)}`
    };
  }

  /* ============================================================
   * 地址生成 — 日本
   * ============================================================ */
  function genJP(data, opts) {
    const prefs = opts.pref ? data.prefs.filter(p => p.n === opts.pref) : data.prefs;
    // 权重: 都道府县按町目数加权（大城市更常出现）
    const totalTowns = prefs.reduce((s, p) => s + p.cities.reduce((x, c) => x + c.t.length, 0), 0);
    let roll = Math.random() * totalTowns, P = prefs[0], C = P.cities[0];
    outer: for (const p of prefs) {
      for (const c of p.cities) {
        roll -= c.t.length;
        if (roll <= 0) { P = p; C = c; break outer; }
      }
    }
    const T = pick(C.t); // [町名, 町假名, 町罗马字, 邮编]

    const chome = ri(1, 5);
    const ban = ri(1, 28), go = ri(1, 15);
    const hasBuilding = chance(0.4);
    const bIdx = ri(0, JP_BUILDING_JP.length - 1), bSpot = ri(0, JP_BUILDING_SPOT_JP.length - 1);
    const room = `${ri(1, 15)}0${ri(1, 9)}`;
    const lotEmpty = !T[0]; // 无町名的市町村（只到番地）

    const banchi = lotEmpty ? `${ri(1, 500)}-${go}` : `${chome}-${ban}-${go}`;
    const zip = T[3];
    const zipFmt = `${zip.slice(0, 3)}-${zip.slice(3)}`;
    const townLocal = lotEmpty ? '' : T[0];

    const bnJP = JP_BUILDING_JP[bIdx].replace('〇〇', JP_BUILDING_SPOT_JP[bSpot]);
    const bnEN = `${JP_BUILDING_EN[bIdx]} ${JP_BUILDING_SPOT_EN[bSpot]}`.replace(/\s+/g, ' ').trim();

    const local = [`〒${zipFmt}`, P.n + C.n + townLocal, banchi];
    if (hasBuilding) local.push(`${bnJP} ${room}号室`);

    const enHead = `${banchi}${T[2] ? ' ' + T[2] : ''}`;
    const enTail = `${C.r}, ${P.r} ${zipFmt}`;
    const en = hasBuilding ? `${enHead}, ${bnEN} ${room}, ${enTail}` : `${enHead}, ${enTail}`;

    const name = nameJP(data.names);
    const phone = phoneJP(data, P.n, opts.phoneType);

    return {
      id: uid(), country: 'jp', countryLabel: '日本',
      region: P.n, gender: name.gender,
      address: { local: local.join(' '), en, postal: zipFmt },
      fields: [
        { label: '邮编', key: 'postal', value: zipFmt },
        { label: '都道府县', key: 'pref', value: P.n },
        { label: '市区町村', key: 'city', value: C.n },
        ...(T[0] ? [{ label: '町丁目', key: 'town', value: T[0] }] : []),
        { label: '番地', key: 'lot', value: banchi },
        ...(hasBuilding ? [{ label: '楼宇', key: 'building', value: `${bnJP} ${room}号室` }] : [])
      ],
      name: { display: `${name.kanji}（${name.romaji}）`, local: name.kanji, kana: name.kana, en: name.romaji },
      phone: { display: phone.number, number: phone.number, intl: phone.intl, type: opts.phoneType }
    };
  }

  /* ============================================================
   * 地址生成 — 香港
   * ============================================================ */
  function genHK(data, opts) {
    const districts = opts.district ? data.districts.filter(d => d.zh === opts.district) : data.districts;
    const D = pick(districts);
    const street = pick(D.streets);
    const hasBuilding = chance(0.75);
    const building = hasBuilding ? pick(D.buildings) : null;
    const streetNo = ri(1, 380);
    const floor = ri(1, 38);
    const flatNum = ri(1, 26);
    const flatLetter = chance(0.35);
    const flat = flatLetter ? String.fromCharCode(65 + ri(0, 5)) + (chance(0.3) ? ri(2, 5) : '') : String(flatNum);

    const localParts = [D.regionZh, `${street.zh}${streetNo}號`];
    if (building) localParts.push(building.zh + (/[A-Za-z0-9]$/.test(building.zh) ? ' ' : ''));
    localParts.push(`${floor}樓`, `${flat}室`);

    const enParts = [`Flat ${flat}, ${floor}/F`];
    if (building) enParts.push(building.en);
    enParts.push(`${streetNo} ${street.en}`);
    enParts.push(D.regionEn === 'Hong Kong Island' ? 'Hong Kong' : D.regionEn);

    const name = nameHK(data);
    const phone = phoneHK(opts.phoneType);

    return {
      id: uid(), country: 'hk', countryLabel: '香港',
      region: `${D.regionZh}·${D.zh}`, gender: name.gender,
      address: { local: localParts.join(''), en: enParts.join(', '), postal: '' },
      fields: [
        { label: '区域', key: 'region', value: D.regionZh },
        { label: '地区', key: 'district', value: D.zh },
        { label: '街道', key: 'street', value: street.zh },
        { label: '门牌', key: 'no', value: `${streetNo}號` },
        ...(building ? [{ label: '大厦', key: 'building', value: building.zh }] : []),
        { label: '楼层/单元', key: 'unit', value: `${floor}樓 ${flat}室` }
      ],
      name: { display: `${name.zh}（${name.en}）`, local: name.zh, en: name.en },
      phone: { display: phone.number, number: phone.number, intl: phone.intl, type: opts.phoneType }
    };
  }

  /* ============================================================
   * 地址生成 — 美国
   * ============================================================ */
  // 无州级一般销售税（2026-09）；AK 的部分地方政府仍征收销售税。
  const US_NO_STATE_SALES_TAX = ['AK', 'DE', 'MT', 'NH', 'OR'];
  const US_NO_STATE_SALES_TAX_VALUE = '__us_no_state_sales_tax__';
  const US_APT = ['Apt', 'Unit', 'Ste.', '#'];
  function genUS(data, opts) {
    const rradStates = data.states || {};
    const cityZips = data.cityZips || {};
    const allStates = [...new Set([...Object.keys(rradStates), ...Object.keys(cityZips)])];
    const states = opts.state === US_NO_STATE_SALES_TAX_VALUE
      ? allStates.filter(st => US_NO_STATE_SALES_TAX.includes(st))
      : opts.state && allStates.includes(opts.state) ? [opts.state] : allStates;
    const st = pick(states);
    const hasApt = chance(0.3);
    const aptNo = chance(0.5) ? String(ri(1, 40)) : ri(1, 9) + String.fromCharCode(65 + ri(0, 3));
    const apt = hasApt ? `${pick(US_APT)} ${aptNo}`.replace('# ', '#') : '';

    let street, city, zip;
    if (rradStates[st] && rradStates[st].length) {
      [street, city, zip] = pick(rradStates[st]);   // 真实门牌（OpenAddresses）
    } else {
      [city, zip] = pick(cityZips[st]);             // 真实城市+邮编
      street = `${ri(100, 9999)} ${pick(data.streets || US_STREETS_FALLBACK)}`;
    }

    const line1 = hasApt ? `${street}, ${apt}` : street;
    const full = `${line1}, ${city}, ${st} ${zip}`;
    const stateFull = data.stateNames[st] || st;

    const name = nameUS(data.names);
    const phone = phoneUS(data, st);

    return {
      id: uid(), country: 'us', countryLabel: '美国',
      region: stateFull, gender: name.gender,
      address: { local: full, en: full, postal: zip },
      fields: [
        { label: '邮编', key: 'postal', value: zip },
        { label: '州', key: 'state', value: stateFull },
        { label: '城市', key: 'city', value: city },
        { label: '街道地址', key: 'street', value: street },
        ...(hasApt ? [{ label: '单元', key: 'apt', value: apt }] : [])
      ],
      name: { display: name.full, local: name.full, en: name.full },
      phone: { display: phone.number, number: phone.number, intl: phone.intl, type: 'mobile' }
    };
  }
  const US_STREETS_FALLBACK = ['Main Street', 'Oak Street', 'Maple Avenue', 'Cedar Lane', 'Elm Street'];

  /* ============================================================
   * 地址生成 — 新加坡
   * ============================================================ */
  function genSG(data, opts) {
    const towns = opts.town ? data.towns.filter(t => t.town === opts.town) : data.towns;
    const useLandmark = chance(0.22) && !opts.town;
    let blk, street, postal, town = opts.town || '', building = null;
    if (useLandmark) {
      const l = pick(data.landmarks);
      [blk, street, building, postal] = l;
    } else {
      const T = pick(towns);
      town = T.town;
      [blk, street, postal] = pick(T.blocks);
    }
    const floor = ri(1, building ? 25 : 40);
    const unit = ri(1, 999);
    const unitStr = `#${pad(floor, 2)}-${pad(unit, 3)}`;
    const line1 = building ? `${blk} ${street}` : `Blk ${blk} ${street}`;
    const full = `${line1}, ${unitStr}, Singapore ${postal}`;

    const name = nameSG(data.names);
    const phone = phoneSG();

    return {
      id: uid(), country: 'sg', countryLabel: '新加坡',
      region: building ? '（商业地标）' : town, gender: name.gender,
      address: { local: full, en: full, postal },
      fields: [
        { label: '邮编', key: 'postal', value: postal },
        { label: '市镇', key: 'town', value: town || '—' },
        { label: '街区', key: 'blk', value: blk },
        { label: '街道', key: 'street', value: street },
        ...(building ? [{ label: '楼宇', key: 'building', value: building }] : []),
        { label: '单元', key: 'unit', value: unitStr }
      ],
      name: { display: `${name.full}${name.race ? '（' + name.race + '）' : ''}`, local: name.full, en: name.full },
      phone: { display: phone.number, number: phone.number, intl: phone.intl, type: opts.phoneType }
    };
  }

  /* ============================================================
   * 入口
   * ============================================================ */
  const GENERATORS = { jp: genJP, hk: genHK, us: genUS, sg: genSG };

  const MockAddr = {
    /** 生成的选项: { pref | district | state | town, phoneType: 'mobile'|'landline' } */
    generate(country, data, opts = {}) {
      const gen = GENERATORS[country];
      if (!gen) throw new Error('未知国家: ' + country);
      if (!data) throw new Error('数据未加载: ' + country);
      return gen(data, opts);
    },
    /** 区域下拉选项，返回 [{value, label}] */
    regionOptions(country, data) {
      switch (country) {
        case 'jp': return data.prefs.map(p => ({ value: p.n, label: p.n }));
        case 'hk': return data.districts.map(d => ({ value: d.zh, label: `${d.zh} ${d.en}` }));
        case 'us': {
          const all = [...new Set([...Object.keys(data.states || {}), ...Object.keys(data.cityZips || {})])];
          return [{ value: US_NO_STATE_SALES_TAX_VALUE, label: '免州级销售税州（5 州）' }, ...all
            .map(s => ({ value: s, label: data.stateNames[s] || s }))
            .sort((a, b) => a.label.localeCompare(b.label))];
        }
        case 'sg': return data.towns.map(t => ({ value: t.town, label: t.town }));
        default: return [];
      }
    },
    countryLabel: { hk: '香港', jp: '日本', us: '美国', sg: '新加坡' },
    usNoStateSalesTaxValue: US_NO_STATE_SALES_TAX_VALUE,
    /** 拼装纯文本（复制用）：本地地址 + 本地姓名 + 手机号（+国家码） */
    toText(rec) {
      const lines = [rec.address.local];
      if (rec.name && rec.name.local) lines.push(rec.name.local);
      if (rec.phone) lines.push(rec.phone.intl);
      return lines.join('\n');
    }
  };

  global.MockAddr = MockAddr;
})(window);
