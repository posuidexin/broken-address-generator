/* ============================================================
 * Broken UI — 国家切换 / 生成 / 复制 / 收藏 / 导出
 * ============================================================ */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const els = {
    tabs: $('#countryTabs'), regionLabel: $('#regionLabel'), regionSelect: $('#regionSelect'),
    taxFreeShortcut: $('#taxFreeShortcut'), taxFreeNote: $('#taxFreeNote'),
    countInput: $('#countInput'), countMinus: $('#countMinus'), countPlus: $('#countPlus'),
    generateBtn: $('#generateBtn'), copyAllBtn: $('#copyAllBtn'),
    nowBar: $('#nowBar'), nowFlag: $('#nowFlag'), nowRegion: $('#nowRegion'), nowHint: $('#nowHint'),
    results: $('#results'),
    savedPanel: $('#savedPanel'), savedList: $('#savedList'), savedCount: $('#savedCount'),
    exportCsvBtn: $('#exportCsvBtn'), exportJsonBtn: $('#exportJsonBtn'), clearSavedBtn: $('#clearSavedBtn'),
    toast: $('#toast')
  };

  const REGION_LABEL = { jp: '都道府县', hk: '地区（18区）', us: '州', sg: '市镇' };
  const OPT_KEY = { jp: 'pref', hk: 'district', us: 'state', sg: 'town' };
  const THEME = {
    hk: { color: '#ff5f7e', flag: '🇭🇰' },
    jp: { color: '#7aa2ff', flag: '🇯🇵' },
    us: { color: '#5eead4', flag: '🇺🇸' },
    sg: { color: '#ffb35c', flag: '🇸🇬' }
  };
  const GENDER_ICON = { '男': '♂', '女': '♀' };
  const emptyTemplate = $('#emptyHint').cloneNode(true);
  let generationVersion = 0;

  const state = {
    country: 'hk',
    data: {},           // 国家 -> 数据
    loading: {},        // 国家 -> Promise
    results: [],        // 当前展示
    saved: loadSaved()
  };

  /* ---------- 收藏存储（防损坏） ---------- */
  function loadSaved() {
    try {
      const v = JSON.parse(localStorage.getItem('mockaddr_saved_v1') || '[]');
      if (!Array.isArray(v)) return [];
      return v.filter(isSavedRecord).map(rec => {
        // 旧版本将香港占位码当作邮编保存；读取时一并纠正。
        if (rec.country === 'hk') {
          rec.address.postal = '';
          rec.fields = rec.fields.filter(f => f.key !== 'postal');
        }
        return rec;
      });
    } catch { return []; }
  }
  function isSavedRecord(rec) {
    return rec && typeof rec === 'object' &&
      typeof rec.id === 'string' && ['hk', 'jp', 'us', 'sg'].includes(rec.country) &&
      typeof rec.countryLabel === 'string' && typeof rec.region === 'string' &&
      rec.address && typeof rec.address.local === 'string' &&
      rec.name && typeof rec.name.local === 'string' &&
      rec.phone && typeof rec.phone.intl === 'string' &&
      Array.isArray(rec.fields);
  }

  /* ---------- 生成频率限制（滚动 1 小时窗口，客户端实现） ---------- */
  const LIMITS = { maxPerBatch: 50, maxGenPerHour: 30, maxRecordsPerHour: 600 };
  const RL_KEY = 'mockaddr_rl_v1';
  function rlSnapshot() {
    const now = Date.now();
    let events = [];
    try {
      const v = JSON.parse(localStorage.getItem(RL_KEY) || '{"events":[]}');
      if (Array.isArray(v.events)) events = v.events;
    } catch { /* 损坏则重置 */ }
    events = events.filter(e => e && typeof e.ts === 'number' && now - e.ts < 3600000);
    return {
      now, events,
      gens: events.length,
      records: events.reduce((a, e) => a + (Number(e.n) || 0), 0)
    };
  }
  function rateAllow(n) {
    const s = rlSnapshot();
    if (s.gens >= LIMITS.maxGenPerHour) return { ok: false, msg: `已达每小时 ${LIMITS.maxGenPerHour} 次生成上限，请稍后再试` };
    if (s.records + n > LIMITS.maxRecordsPerHour) return { ok: false, msg: `已达每小时 ${LIMITS.maxRecordsPerHour} 条上限，请稍后再试` };
    return { ok: true, snap: s };
  }
  function rateRecord(n, snap) {
    snap.events.push({ ts: snap.now, n });
    try { localStorage.setItem(RL_KEY, JSON.stringify({ events: snap.events })); } catch { }
  }
  function rateHint() {
    const s = rlSnapshot();
    return `本小时剩余 ${Math.max(0, LIMITS.maxGenPerHour - s.gens)} 次 / ${Math.max(0, LIMITS.maxRecordsPerHour - s.records)} 条`;
  }

  /* ---------- 数据懒加载（file:// 兼容） ---------- */
  function loadCountry(country) {
    if (state.data[country]) return Promise.resolve(state.data[country]);
    // 已由 <script> 标签预加载的数据直接复用
    if (window.__ADDR_DATA__ && window.__ADDR_DATA__[country]) {
      state.data[country] = window.__ADDR_DATA__[country];
      return Promise.resolve(state.data[country]);
    }
    if (!state.loading[country]) {
      state.loading[country] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = `data/${country}.js?v=${document.body.dataset.v || '1'}`;
        s.onload = () => {
          const d = window.__ADDR_DATA__ && window.__ADDR_DATA__[country];
          d ? resolve(d) : reject(new Error('数据加载失败'));
        };
        s.onerror = () => reject(new Error('数据文件不存在'));
        document.head.appendChild(s);
      });
    }
    return state.loading[country];
  }

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 1800);
  }

  async function copyText(text) {
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      try { copied = document.execCommand('copy'); } catch { /* 浏览器拒绝复制 */ }
      ta.remove();
    }
    toast(copied ? '已复制到剪贴板' : '复制失败，请手动选择文本');
  }

  /* ---------- 国家切换 ---------- */
  els.tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.cs-btn');
    if (!btn) return;
    const country = btn.dataset.country;
    if (country === state.country) return;
    state.country = country;
    generationVersion++;
    state.results = [];
    renderResults([]);
    els.tabs.querySelectorAll('.cs-btn').forEach(t => {
      const active = t === btn;
      t.classList.toggle('active', active);
      t.setAttribute('aria-pressed', String(active));
    });
    setupCountry(country);
  });

  function setupCountry(country) {
    els.regionLabel.textContent = REGION_LABEL[country];
    els.regionSelect.innerHTML = '<option value="">🎲 随机</option>';
    els.regionSelect.disabled = true;
    const isUS = country === 'us';
    els.taxFreeShortcut.hidden = !isUS;
    els.taxFreeShortcut.disabled = true;
    els.taxFreeNote.hidden = !isUS;
    syncTaxFreeShortcut();
    updateNowBar('数据加载中…');
    loadCountry(country)
      .then((data) => {
        if (state.country !== country) return;
        const opts = MockAddr.regionOptions(country, data);
        const frag = document.createDocumentFragment();
        for (const o of opts) {
          const op = document.createElement('option');
          op.value = o.value; op.textContent = o.label;
          frag.appendChild(op);
        }
        els.regionSelect.appendChild(frag);
        els.regionSelect.disabled = false;
        els.taxFreeShortcut.disabled = !isUS;
        updateNowBar();
      })
      .catch(() => toast('数据加载失败，请刷新重试'));
  }

  /* ---------- 当前地区指示条 ---------- */
  function updateNowBar(hint) {
    const theme = THEME[state.country] || {};
    els.nowFlag.textContent = theme.flag || '';
    els.nowBar.style.setProperty('--ca', theme.color || 'var(--accent)');
    const opt = els.regionSelect.selectedOptions[0];
    const regionText = opt ? opt.textContent.replace(/^🎲\s*/, '') : '随机';
    els.nowRegion.textContent = `${MockAddr.countryLabel[state.country]} · ${regionText}`;
    els.nowHint.textContent = hint || '选择地区后点击「生成地址」';
  }
  function syncTaxFreeShortcut() {
    const active = state.country === 'us' && els.regionSelect.value === MockAddr.usNoStateSalesTaxValue;
    els.taxFreeShortcut.classList.toggle('active', active);
    els.taxFreeShortcut.setAttribute('aria-pressed', String(active));
  }
  els.regionSelect.addEventListener('change', () => {
    generationVersion++;
    state.results = [];
    renderResults([]);
    syncTaxFreeShortcut();
    updateNowBar();
  });
  els.taxFreeShortcut.addEventListener('click', () => {
    if (state.country !== 'us' || els.taxFreeShortcut.disabled) return;
    els.regionSelect.value = els.regionSelect.value === MockAddr.usNoStateSalesTaxValue
      ? '' : MockAddr.usNoStateSalesTaxValue;
    els.regionSelect.dispatchEvent(new Event('change', { bubbles: true }));
  });

  /* ---------- 生成 ---------- */
  async function generate() {
    const country = state.country;
    const version = generationVersion;
    const region = els.regionSelect.value || '';
    const count = Math.min(LIMITS.maxPerBatch, Math.max(1, parseInt(els.countInput.value, 10) || 1));
    els.countInput.value = count;

    const allow = rateAllow(count);
    if (!allow.ok) {
      toast(allow.msg);
      updateNowBar(allow.msg);
      return;
    }

    let data;
    try { data = await loadCountry(country); }
    catch { toast('数据加载失败，请刷新重试'); return; }
    if (version !== generationVersion || country !== state.country) return;

    // 加载期间可能已有其他点击完成生成；以提交时的配额为准。
    const latestAllow = rateAllow(count);
    if (!latestAllow.ok) {
      toast(latestAllow.msg);
      updateNowBar(latestAllow.msg);
      return;
    }

    const opts = {
      phoneType: 'mobile',
      [OPT_KEY[country]]: region
    };
    const records = [];
    for (let i = 0; i < count; i++) records.push(MockAddr.generate(country, data, opts));
    state.results = records;
    renderResults(records);
    rateRecord(count, latestAllow.snap);
    updateNowBar(`已生成 ${count} 条 · ${rateHint()}`);
  }

  /* ---------- 渲染结果 ---------- */
  function chip(label, value, rec) {
    const span = document.createElement('span');
    span.className = 'field';
    span.innerHTML = `<span class="k">${escapeHtml(label)}</span><span class="v">${escapeHtml(value)}</span>` +
      `<button class="copy-one" data-copy="${escapeAttr(value)}" title="复制" aria-label="复制${escapeAttr(label)}">⧉</button>`;
    return span;
  }

  function renderCard(rec) {
    const theme = THEME[rec.country] || {};
    const card = document.createElement('article');
    card.className = 'addr-card';
    card.dataset.id = rec.id;
    if (theme.color) card.style.setProperty('--ca', theme.color);

    const saved = state.saved.some(s => s.id === rec.id);
    const genderIcon = GENDER_ICON[rec.gender] || '';

    const head = document.createElement('div');
    head.className = 'card-head';
    head.innerHTML = `
      <div class="who">
        <span class="flag-badge">${theme.flag || ''}</span>
        <b>${escapeHtml(rec.name.local)}</b>
        <span class="gender">${genderIcon}</span>
        <span class="region-chip">${escapeHtml(rec.region)}</span>
      </div>
      <div class="card-actions">
         <button class="icon-btn star${saved ? ' active' : ''}" data-act="star" title="收藏" aria-label="${saved ? '取消收藏' : '收藏'}">${saved ? '★' : '☆'}</button>
         <button class="icon-btn" data-act="copy" title="复制本条" aria-label="复制本条记录">📋</button>
      </div>`;

    const main = document.createElement('div');
    main.className = 'addr-main';
    main.innerHTML = `
      <div class="addr-line">${escapeHtml(rec.address.local)}</div>
       <button class="copy-line" data-copy="${escapeAttr(rec.address.local)}" aria-label="复制地址">复制</button>`;

    const wrap = document.createElement('div');
    wrap.className = 'field-wrap';
    for (const f of rec.fields) wrap.appendChild(chip(f.label, f.value));
    wrap.appendChild(chip('姓名', rec.name.local));
    wrap.appendChild(chip('手机', rec.phone.intl));

    card.append(head, main, wrap);
    return card;
  }

  function renderResults(records) {
    els.results.innerHTML = '';
    els.results.classList.toggle('single', records.length === 1);
    if (!records.length) {
      els.results.appendChild(emptyTemplate.cloneNode(true));
      return;
    }
    const frag = document.createDocumentFragment();
    for (const r of records) frag.appendChild(renderCard(r));
    if (records.length === 1) frag.firstElementChild.classList.add('solo');
    els.results.appendChild(frag);
  }

  /* ---------- 事件委托: 复制 / 收藏 ---------- */
  els.results.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.copy-one, .copy-line');
    if (copyBtn) { copyText(copyBtn.dataset.copy); return; }
    const btn = e.target.closest('.icon-btn');
    if (!btn) return;
    const card = btn.closest('.addr-card');
    const rec = state.results.find(r => r.id === card.dataset.id);
    if (!rec) return;
    if (btn.dataset.act === 'copy') {
      copyText(MockAddr.toText(rec));
    } else if (btn.dataset.act === 'star') {
      toggleSaved(rec, btn);
    }
  });

  function toggleSaved(rec, btn) {
    const idx = state.saved.findIndex(s => s.id === rec.id);
    if (idx >= 0) {
      state.saved.splice(idx, 1);
      if (btn) { btn.classList.remove('active'); btn.textContent = '☆'; btn.setAttribute('aria-label', '收藏'); }
      toast('已取消收藏');
    } else {
      state.saved.unshift(rec);
      if (btn) { btn.classList.add('active'); btn.textContent = '★'; btn.setAttribute('aria-label', '取消收藏'); }
      toast('已加入收藏');
    }
    persistSaved();
  }

  function persistSaved() {
    try { localStorage.setItem('mockaddr_saved_v1', JSON.stringify(state.saved)); }
    catch { toast('浏览器存储不可用，收藏仅在当前页面有效'); }
    renderSaved();
  }

  function renderSaved() {
    els.savedCount.textContent = state.saved.length;
    els.savedPanel.hidden = state.saved.length === 0;
    els.savedList.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const rec of state.saved) {
      const theme = THEME[rec.country] || {};
      const li = document.createElement('li');
      li.className = 'saved-item';
      if (theme.color) li.style.setProperty('--ca', theme.color);
      li.innerHTML = `
        <div class="saved-text">
          <strong>${theme.flag || ''} ${escapeHtml(rec.name.local)} · ${escapeHtml(rec.countryLabel)}</strong>
          <span>${escapeHtml(rec.address.local)}</span>
        </div>
         <button class="icon-btn" data-copy-id="${escapeAttr(rec.id)}" title="复制" aria-label="复制收藏记录">📋</button>
         <button class="icon-btn del" data-del-id="${escapeAttr(rec.id)}" title="删除" aria-label="删除收藏记录">✕</button>`;
      frag.appendChild(li);
    }
    els.savedList.appendChild(frag);
  }

  els.savedList.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('[data-copy-id]');
    const delBtn = e.target.closest('[data-del-id]');
    if (copyBtn) {
      const rec = state.saved.find(s => s.id === copyBtn.dataset.copyId);
      if (rec) copyText(MockAddr.toText(rec));
    } else if (delBtn) {
      state.saved = state.saved.filter(s => s.id !== delBtn.dataset.delId);
      persistSaved();
      // 不使用动态拼接选择器，避免 id 注入
      document.querySelectorAll('.addr-card').forEach(c => {
        if (c.dataset.id !== delBtn.dataset.delId) return;
        const starBtn = c.querySelector('.star');
        if (starBtn) { starBtn.classList.remove('active'); starBtn.textContent = '☆'; starBtn.setAttribute('aria-label', '收藏'); }
      });
    }
  });

  /* ---------- 导出 ---------- */
  function downloadFile(name, content, mime) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  const CSV_COLS = ['国家', '地区', '姓名', '地址', '邮编', '手机'];
  function recToRow(rec) {
    return [
      rec.countryLabel, rec.region, rec.name.local, rec.address.local,
      rec.address.postal || '', rec.phone.intl
    ];
  }
  function csvEscape(v) {
    v = String(v ?? '');
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }

  els.exportCsvBtn.addEventListener('click', () => {
    if (!state.saved.length) return toast('收藏列表为空');
    const csv = '\uFEFF' + [CSV_COLS, ...state.saved.map(recToRow)].map(r => r.map(csvEscape).join(',')).join('\r\n');
    downloadFile(`broken-${dateStr()}.csv`, csv, 'text/csv;charset=utf-8');
    toast('CSV 已导出');
  });

  els.exportJsonBtn.addEventListener('click', () => {
    if (!state.saved.length) return toast('收藏列表为空');
    downloadFile(`broken-${dateStr()}.json`, JSON.stringify(state.saved, null, 2), 'application/json');
    toast('JSON 已导出');
  });

  els.clearSavedBtn.addEventListener('click', () => {
    if (!state.saved.length) return;
    if (!confirm('确定清空全部已收藏的记录吗？此操作无法撤销。')) return;
    state.saved = [];
    persistSaved();
    document.querySelectorAll('.addr-card .star.active').forEach(b => { b.classList.remove('active'); b.textContent = '☆'; b.setAttribute('aria-label', '收藏'); });
    toast('已清空收藏');
  });

  function dateStr() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  /* ---------- 其余控件 ---------- */
  els.generateBtn.addEventListener('click', generate);
  els.copyAllBtn.addEventListener('click', () => {
    if (!state.results.length) return toast('请先生成测试地址');
    copyText(state.results.map(r => MockAddr.toText(r)).join('\n\n'));
  });
  els.countMinus.addEventListener('click', () => { els.countInput.value = Math.max(1, (parseInt(els.countInput.value, 10) || 1) - 1); });
  els.countPlus.addEventListener('click', () => { els.countInput.value = Math.min(LIMITS.maxPerBatch, (parseInt(els.countInput.value, 10) || 1) + 1); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.ctrlKey) generate(); });

  /* ---------- HTML 转义 ---------- */
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/\n/g, '&#10;'); }

  /* ---------- 初始化 ---------- */
  setupCountry(state.country);
  renderSaved();
})();
