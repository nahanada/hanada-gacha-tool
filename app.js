(() => {
  'use strict';

  const KEYS = {
    normal: 'hanada-gacha:normal',
    special: 'hanada-gacha:special',
    drawn: 'hanada-gacha:drawn',
    tab: 'hanada-gacha:tab',
  };
  const RARITY = { '1': 'UR ', '2': 'SSR ', '3': 'SR ', '4': 'R ', '5': 'N ' };
  const RARITY_RE = /^(UR|SSR|SR|R|N) /;

  const $ = (id) => document.getElementById(id);
  const normalText = $('normalText');
  const specialText = $('specialText');

  const load = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

  let drawn = new Set();
  try { drawn = new Set(JSON.parse(load(KEYS.drawn, '[]'))); } catch { drawn = new Set(); }

  const parse = (text, unique) => {
    const items = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    return unique ? [...new Set(items)] : items;
  };
  const normalItems = () => parse(normalText.value, false);
  const specialItems = () => parse(specialText.value, true);
  const saveDrawn = () => save(KEYS.drawn, JSON.stringify([...drawn]));

  /* ---------- tabs ---------- */
  let slideTimer;
  function showTab(name) {
    document.querySelectorAll('.menu-item').forEach((t) => {
      t.classList.toggle('active', t.dataset.tab === name);
      if (t.dataset.tab === name) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    const pages = document.querySelectorAll('.page');
    pages.forEach((p) => p.classList.add('sliding'));
    pages.forEach((p) => p.classList.toggle('active', p.id === 'page-' + name));
    $('track').classList.toggle('at-gacha', name === 'gacha');
    clearTimeout(slideTimer);
    slideTimer = setTimeout(() => pages.forEach((p) => p.classList.remove('sliding')), 400);
    save(KEYS.tab, name);
    if (name === 'gacha') renderGacha();
  }
  document.querySelectorAll('.menu-item').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

  /* ---------- input page ---------- */
  function updateCounts() {
    $('normalCount').textContent = normalItems().length;
    $('specialCount').textContent = specialItems().length;
  }

  function onInput() {
    save(KEYS.normal, normalText.value);
    save(KEYS.special, specialText.value);
    updateCounts();
    renderGacha();
  }

  function rarityKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    const prefix = RARITY[e.key];
    if (!prefix) return;
    e.preventDefault();
    const ta = e.target;
    const v = ta.value;
    const pos = ta.selectionStart;
    const lineStart = v.lastIndexOf('\n', pos - 1) + 1;
    let lineEnd = v.indexOf('\n', pos);
    if (lineEnd === -1) lineEnd = v.length;
    const line = v.slice(lineStart, lineEnd).replace(RARITY_RE, '');
    let after = v.slice(lineEnd);
    if (after === '') after = '\n';
    ta.value = v.slice(0, lineStart) + prefix + line + after;
    const next = lineStart + prefix.length + line.length + 1;
    ta.setSelectionRange(next, next);
    // keep the caret line visible
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
    const row = ta.value.slice(0, next).split('\n').length;
    if (row * lh > ta.scrollTop + ta.clientHeight - lh) ta.scrollTop = row * lh - ta.clientHeight + lh * 2;
    onInput();
  }

  [normalText, specialText].forEach((ta) => {
    ta.addEventListener('input', onInput);
    ta.addEventListener('keydown', rarityKey);
  });

  /* ---------- gacha page ---------- */
  function cell(tag, text, cls) {
    const el = document.createElement(tag);
    el.className = 'cell ' + cls;
    el.textContent = text;
    return el;
  }

  const ORDER = ['UR', 'SSR', 'SR', 'R', 'N'];
  const rank = (s) => {
    const m = s.match(RARITY_RE);
    return m ? ORDER.indexOf(m[1]) : ORDER.length;
  };
  const byRarity = (arr) => arr.map((v, i) => [v, i])
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
    .map((p) => p[0]);

  function renderGacha() {
    const normals = byRarity(normalItems());
    const specials = byRarity(specialItems());
    const remain = specials.filter((s) => !drawn.has(s)).length;

    $('specialSummary').textContent = `残り ${remain} / ${specials.length}`;
    $('normalSummary').textContent = `${normals.length} 件`;

    const fill = (el, items, empty, make, countOf) => {
      el.textContent = '';
      if (!items.length) { el.textContent = empty; return; }
      let last = null;
      items.forEach((name) => {
        const r = rank(name);
        if (r !== last) {
          last = r;
          const group = items.filter((n) => rank(n) === r);
          const h = document.createElement('div');
          h.className = 'grid-head';
          h.textContent = r < ORDER.length ? ORDER[r] : 'その他';
          const s = document.createElement('small');
          s.textContent = countOf(group);
          h.appendChild(s);
          el.appendChild(h);
        }
        el.appendChild(make(name));
      });
    };

    fill($('specialGrid'), specials, '特別枠が未入力です', (name) => {
      const isDrawn = drawn.has(name);
      const c = cell('button', name, isDrawn ? 'drawn' : '');
      c.type = 'button';
      c.title = isDrawn ? 'クリックで復活' : '';
      c.addEventListener('click', () => {
        if (drawn.has(name)) drawn.delete(name); else drawn.add(name);
        saveDrawn();
        renderGacha();
      });
      return c;
    }, (g) => `残り ${g.filter((n) => !drawn.has(n)).length} / ${g.length}`);

    fill($('normalGrid'), normals, '通常枠が未入力です',
      (name) => cell('div', name, 'plain'), (g) => `${g.length} 件`);
  }

  function draw(times) {
    const normals = normalItems();
    const specials = specialItems();
    const results = [];
    for (let i = 0; i < times; i++) {
      const pool = normals.map((name) => ({ name, special: false }))
        .concat(specials.filter((s) => !drawn.has(s)).map((name) => ({ name, special: true })));
      if (!pool.length) break;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (pick.special) drawn.add(pick.name);
      results.push(pick);
    }
    saveDrawn();
    $('status').textContent = results.length === 0
      ? '抽選対象がありません。入力ページでデータを追加するか、リセットしてください。'
      : results.length < times ? '抽選対象が尽きたため途中で終了しました。' : '';
    if (results.length) {
      const ul = $('results');
      ul.textContent = '';
      results.forEach((r) => {
        const li = document.createElement('li');
        if (r.special) li.className = 'special';
        li.textContent = r.name;
        ul.appendChild(li);
      });
    }
    renderGacha();
  }

  $('drawBtn').addEventListener('click', () => draw(1));

  $('resetBtn').addEventListener('click', () => {
    drawn = new Set();
    saveDrawn();
    $('status').textContent = '';
    renderGacha();
  });

  /* ---------- init ---------- */
  normalText.value = load(KEYS.normal, '');
  specialText.value = load(KEYS.special, '');
  updateCounts();
  setTimeout(() => document.querySelector('.header').classList.add('menu-open'), 50);
  showTab(load(KEYS.tab, 'input') === 'gacha' ? 'gacha' : 'input');
})();
