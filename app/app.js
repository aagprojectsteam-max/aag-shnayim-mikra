/* AAG Shnayim Mikra — Otzaria tool tab (also runs standalone in a browser). */
'use strict';
const HAS_OTZ = typeof window.Otzaria !== 'undefined';
const M = window.SM_META;
const KEY = 'state';
const ALIYOT = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שביעי'];
const PAIRS = [[21, 22], [26, 27], [28, 29], [31, 32], [38, 39], [41, 42], [50, 51]];
const COLORS = [['ink', 'שחור'], ['blue', 'כחול'], ['green', 'ירוק'], ['red', 'אדום'], ['brown', 'חום'], ['purple', 'סגול'], ['teal', 'טורקיז'], ['gray', 'אפור']];
const SPECIAL_ORDER = ['chanukah1', 'chanukah2', 'shekalim', 'zachor', 'parah', 'hachodesh', 'shuva', 'roshchodesh', 'macharchodesh', 'hagadol', 'pinchas_bein'];
const DEF = { mode: 'p', view: null, rashi: false, nikud: true, teamim: true, aliyot: true, fs: 32, fsv: 2, c1: 'ink', c2: 'blue', ct: 'brown', il: true, nusach: 'a', bm: null };
const S = Object.assign({}, DEF);
let hafChoice = null; // 'reg' | 'spec' for the current view

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- Hebrew numbers and dates ---------- */
function gem(n) {
  const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  const hund = ['', 'ק', 'ר', 'ש', 'ת'];
  let s = '';
  while (n >= 400) { s += 'ת'; n -= 400; }
  if (n >= 100) { s += hund[Math.floor(n / 100)]; n %= 100; }
  if (n === 15) s += 'טו'; else if (n === 16) s += 'טז';
  else s += tens[Math.floor(n / 10)] + ones[n % 10];
  return s;
}
function gemP(n) {
  const s = gem(n);
  return s.length === 1 ? s + '׳' : s.slice(0, -1) + '״' + s.slice(-1);
}
function hebDate(rd) {
  const h = SMCal.toHeb(rd);
  return `${gemP(h.d)} ${SMCal.monthName(h.y, h.m)} ${gemP(h.y % 1000)}`;
}
function gregDate(rd) {
  const d = SMCal.toDate(rd);
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

/* ---------- data ---------- */
window.SM_BOOK = window.SM_BOOK || {};
const loading = {};
function loadScript(src, ready) {
  if (ready()) return Promise.resolve();
  if (loading[src]) return loading[src];
  loading[src] = new Promise((res, rej) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => res();
    el.onerror = () => { delete loading[src]; rej(new Error(src)); };
    document.head.appendChild(el);
  });
  return loading[src];
}
const loadBook = b => loadScript(`data/book${b + 1}.js`, () => !!window.SM_BOOK[b]);
const loadHaft = () => loadScript('data/haftarot.js', () => !!window.SM_HAFT);
const V = (b, c, v) => window.SM_BOOK[b][c - 1][v - 1];
const nVerses = (b, c) => M.books[b].verses[c - 1];
function nextRef([b, c, v]) {
  if (v < nVerses(b, c)) return [b, c, v + 1];
  if (c < M.books[b].verses.length) return [b, c + 1, 1];
  return null;
}
function* range(b, c1, v1, c2, v2) {
  let r = [b, c1, v1];
  while (r) {
    yield r;
    if (r[1] === c2 && r[2] === v2) return;
    r = nextRef(r);
  }
}
const pStart = pi => M.parashot[pi].aliyot[0].slice(0, 3);
const pEnd = pi => { const a = M.parashot[pi].aliyot[6]; return [a[0], a[3], a[4]]; };
const refLabel = ([b, c, v]) => `${M.books[b].he} ${gem(c)}, ${gem(v)}`;

/* markers: "b:c:v" -> {p: parasha index, a: aliyah number} */
const MARK = {};
M.parashot.forEach((P, pi) => P.aliyot.forEach((a, i) => {
  const k = `${a[0]}:${a[1]}:${a[2]}`;
  MARK[k] = Object.assign(MARK[k] || {}, i === 0 ? { p: pi, a: 1 } : { a: i + 1 });
}));
function parashaOf(b, c, v) {
  for (let pi = 0; pi < 54; pi++) {
    const [sb, sc, sv] = pStart(pi), [, ec, ev] = pEnd(pi);
    if (sb !== b) continue;
    const after = c > sc || (c === sc && v >= sv), before = c < ec || (c === ec && v <= ev);
    if (after && before) return pi;
  }
  return -1;
}

/* ---------- text processing ---------- */
const RX_TEAMIM = /[֑-ֽ֯]|\s?׀/g;
const RX_NIKUD = /[ְ-ׇּֿׁׂׅׄ]/g;
function fx(s) {
  if (!s) return '';
  if (!S.teamim) s = s.replace(RX_TEAMIM, '');
  if (!S.nikud) s = s.replace(RX_NIKUD, '');
  return s;
}
function splitMikra(s) {
  const brk = /<i class="pt">/.test(s);
  return { t: s.replace(/\s*<i class="pt">[^<]*<\/i>\s*/g, ' ').trim(), brk };
}

/* ---------- rendering ---------- */
function verseHTML(b, c, v, opts) {
  const [mk, tg, rs] = V(b, c, v);
  const { t, brk } = splitMikra(mk);
  const bm = S.bm && S.bm.r.join(':') === `${b}:${c}:${v}`;
  let h = `<span class="v${bm ? ' bm' : ''}" id="v-${b}-${c}-${v}">`;
  const mark = MARK[`${b}:${c}:${v}`];
  if (mark && mark.p !== undefined && opts.parLabel) h += `<span class="lbl par">פרשת ${esc(M.parashot[mark.p].he)}</span>`;
  if (mark && S.aliyot && opts.aliyot !== false) h += `<span class="lbl">${ALIYOT[mark.a - 1]}</span>`;
  if (v === 1 || opts.first) h += `<span class="chn">פרק ${gem(c)}</span>`;
  h += `<span class="vn" data-r="${b}:${c}:${v}" title="סימניה כאן">${gem(v)}</span>`;
  h += `<span class="m1">${fx(t)}</span> <span class="m2">${fx(t)}</span> <span class="tg">${fx(tg)}</span>`;
  if (S.rashi && rs && rs.length) h += ` <span class="rs">${fx(rs.join(' · '))}</span>`;
  return { h: h + '</span> ', brk };
}
function flow(refs, opts) {
  // one paragraph per verse (its two readings + targum); a {פ}/{ס} break adds extra space before the next verse
  let out = '', first = true, gap = false;
  for (const [b, c, v] of refs) {
    const r = verseHTML(b, c, v, Object.assign({ first }, opts));
    out += `<p class="vp${gap ? ' gap' : ''}">${r.h}</p>`;
    gap = r.brk; first = false;
  }
  return out;
}
function endBlock(lastPi) {
  const [b, c, v] = pEnd(lastPi);
  const last = splitMikra(V(b, c, v)[0]).t;
  const np = (lastPi + 1) % 54;
  let r = pStart(np), next = '';
  for (let i = 0; i < 3 && r; i++, r = nextRef(r)) {
    next += `<span class="vn vn-static">${gem(r[2])}</span><span class="m1">${fx(splitMikra(V(...r)[0]).t)}</span> `;
  }
  return `<div class="blk"><h4>סיום הפרשה — הפסוק האחרון פעמיים</h4>` +
    `<span class="m1">${fx(last)}</span> <span class="m2">${fx(last)}</span></div>` +
    `<div class="blk"><h4>שלושה פסוקים ראשונים של פרשת ${esc(M.parashot[np].he)}</h4>${next}</div>`;
}
function hafRefs(list) {
  return (list || []).map(ref => {
    const r = M.hafRefs[ref];
    if (!r) return ref;
    const [bk, c1, v1, c2, v2] = r;
    return `${bk} ${gem(c1)}, ${gem(v1)} – ${c2 !== c1 ? gem(c2) + ', ' : ''}${gem(v2)}`;
  }).join('; ');
}
function hafInfo(view) {
  const ps = view.ps;
  const hp = ps.length === 2 ? (ps[0] === 50 ? 50 : ps[1]) : ps[0];
  const reg = M.haft[hp] ? (M.haft[hp][S.nusach] || M.haft[hp].a) : null;
  let spec = null;
  if (view.rd) {
    const keys = SMCal.special(view.rd, hp);
    const k = SPECIAL_ORDER.find(x => keys.includes(x) && M.special[x]);
    if (k) spec = { k, name: M.special[k].name, refs: M.special[k][S.nusach] || M.special[k].a };
  }
  return { reg, spec };
}
function hafSection(view) {
  const { reg, spec } = hafInfo(view);
  const useSpec = spec && hafChoice !== 'reg';
  const refs = useSpec ? spec.refs : reg;
  if (!refs || !refs.length) return '';
  let note = '';
  if (spec) {
    note = `<div class="note">השבת ${esc(spec.name)} — ${useSpec ? 'מוצגת ההפטרה המיוחדת' : 'מוצגת ההפטרה הרגילה של הפרשה'}.` +
      `<button type="button" class="chip" data-haf="${useSpec ? 'reg' : 'spec'}">${useSpec ? 'להפטרה הרגילה' : 'להפטרה המיוחדת'}</button></div>`;
  }
  return `<details class="haft" id="haft"${hafChoice ? ' open' : ''}><summary>הפטרה (${S.nusach === 's' ? 'ספרד' : 'אשכנז'}): ${esc(hafRefs(refs))}</summary>${note}<div id="haftText" data-refs="${esc(refs.join('|'))}"></div></details>`;
}
async function fillHaft() {
  const box = $('haftText');
  if (!box || box.dataset.done) return;
  box.innerHTML = '<div class="loading">טוען…</div>';
  try { await loadHaft(); } catch (e) { box.textContent = 'לא הצלחתי לטעון את ההפטרות.'; return; }
  let h = '';
  for (const ref of box.dataset.refs.split('|')) {
    const vs = window.SM_HAFT[ref] || [];
    h += '<p>';
    for (const [c, v, t] of vs) {
      const s = splitMikra(t);
      h += `<span class="vn vn-static">${gem(v)}</span><span class="m1">${fx(s.t)}</span> `;
      if (s.brk) h += '</p><p>';
    }
    h += '</p>';
  }
  box.innerHTML = h.replace(/<p><\/p>/g, '');
  box.dataset.done = '1';
}

async function render() {
  applyLook();
  const view = S.view;
  $('modeParasha').setAttribute('aria-selected', String(S.mode === 'p'));
  $('modeChapter').setAttribute('aria-selected', String(S.mode === 'c'));
  $('resumeBtn').disabled = !S.bm;
  const text = $('text');
  text.innerHTML = '<div class="loading">טוען…</div>';
  let sub = '', body = '', pager = '';
  try {
    if (view.t === 'p') {
      const books = new Set(view.ps.map(pi => pStart(pi)[0]));
      books.add(pStart((view.ps[view.ps.length - 1] + 1) % 54)[0]);
      await Promise.all([...books].map(loadBook));
      const names = view.ps.map(pi => M.parashot[pi].he);
      $('pickLabel').textContent = names.join('–');
      const s = pStart(view.ps[0]), e = pEnd(view.ps[view.ps.length - 1]);
      sub = `<h2>${view.ps.length > 1 ? 'פרשות' : 'פרשת'} ${esc(names.join('–'))}</h2><div class="meta">${refLabel(s)} – ${gem(e[1])}, ${gem(e[2])}`;
      if (view.rd) sub += ` · שבת ${hebDate(view.rd)} · ${gregDate(view.rd)} · ${S.il ? 'ארץ ישראל' : 'חוץ לארץ'}`;
      sub += '</div>';
      for (const pi of view.ps) {
        const st = pStart(pi), en = pEnd(pi);
        if (view.ps.length > 1) body += `<p><span class="lbl par">פרשת ${esc(M.parashot[pi].he)}</span></p>`;
        body += flow(range(st[0], st[1], st[2], en[1], en[2]), {});
      }
      body += endBlock(view.ps[view.ps.length - 1]);
      body += hafSection(view);
      const prev = (view.ps[0] + 53) % 54, next = (view.ps[view.ps.length - 1] + 1) % 54;
      pager = `<button type="button" class="btn" data-go="p:${prev}">→ ${esc(M.parashot[prev].he)}</button>` +
        `<button type="button" class="btn" data-go="p:${next}">${esc(M.parashot[next].he)} ←</button>`;
    } else {
      const { b, c } = view;
      await loadBook(b);
      const label = `${M.books[b].he} ${gem(c)}`;
      $('pickLabel').textContent = label;
      const pis = new Set([parashaOf(b, c, 1), parashaOf(b, c, nVerses(b, c))].filter(x => x >= 0));
      sub = `<h2>${esc(M.books[b].he)} פרק ${gem(c)}</h2><div class="meta">${[...pis].map(pi => 'פרשת ' + esc(M.parashot[pi].he)).join(' · ')}</div>`;
      body = flow(range(b, c, 1, c, nVerses(b, c)), { parLabel: true });
      const pr = c > 1 ? [b, c - 1] : (b > 0 ? [b - 1, M.books[b - 1].verses.length] : null);
      const nx = c < M.books[b].verses.length ? [b, c + 1] : (b < 4 ? [b + 1, 1] : null);
      pager = (pr ? `<button type="button" class="btn" data-go="c:${pr[0]}:${pr[1]}">→ ${esc(M.books[pr[0]].he)} ${gem(pr[1])}</button>` : '<span></span>') +
        (nx ? `<button type="button" class="btn" data-go="c:${nx[0]}:${nx[1]}">${esc(M.books[nx[0]].he)} ${gem(nx[1])} ←</button>` : '');
    }
  } catch (e) {
    text.innerHTML = '<div class="loading">לא הצלחתי לטעון את הטקסט.</div>';
    return;
  }
  $('sub').innerHTML = sub;
  text.innerHTML = body;
  $('pager').innerHTML = pager;
  const det = $('haft');
  if (det) {
    det.addEventListener('toggle', () => { if (det.open) fillHaft(); });
    if (det.open) fillHaft();
  }
}

function applyLook() {
  const r = document.documentElement.style;
  r.setProperty('--fs', S.fs + 'px');
  r.setProperty('--c1', `var(--k-${S.c1})`);
  r.setProperty('--c2', `var(--k-${S.c2})`);
  r.setProperty('--ct', `var(--k-${S.ct})`);
}

/* ---------- navigation ---------- */
function weeklyView() {
  const r = SMCal.weekly(SMCal.fromDate(new Date()), S.il);
  return { t: 'p', ps: r.p, rd: r.rd };
}
function go(view, scrollTo) {
  S.view = view;
  S.mode = view.t;
  hafChoice = null;
  save();
  closePops();
  render().then(() => {
    const el = scrollTo && document.getElementById(scrollTo);
    if (el) el.scrollIntoView({ block: 'center' });
    else $('main').scrollTop = 0;
  });
}
function setBookmark(r) {
  S.bm = { r, view: S.view };
  save();
  document.querySelectorAll('.v.bm').forEach(el => el.classList.remove('bm'));
  const el = document.getElementById(`v-${r.join('-')}`);
  if (el) el.classList.add('bm');
  $('resumeBtn').disabled = false;
  toast('סימניה נשמרה: ' + refLabel(r));
}
function resume() {
  if (!S.bm) return;
  const r = S.bm.r;
  go(S.bm.view || { t: 'c', b: r[0], c: r[1] }, `v-${r.join('-')}`);
}

/* ---------- popovers ---------- */
function closePops(except) {
  ['pickPop', 'setPop', 'aboutPop'].forEach(id => { if (id !== except) $(id).hidden = true; });
}
function togglePop(id, build) {
  const el = $(id);
  if (!el.hidden) { el.hidden = true; return; }
  closePops(id);
  build(el);
  el.hidden = false;
}
let pickBook = 0, pickChapter = 0;
function buildPick(el) {
  if (S.mode === 'p') {
    const wk = weeklyView().ps;
    const cur = S.view && S.view.t === 'p' ? S.view.ps.join(',') : '';
    let h = '';
    for (let b = 0; b < 5; b++) {
      h += `<h3>${esc(M.books[b].he)}</h3><div class="grid">`;
      M.parashot.forEach((P, pi) => {
        if (pStart(pi)[0] !== b) return;
        const cls = (cur === String(pi) ? ' on' : '') + (wk.includes(pi) ? ' week' : '');
        h += `<button type="button" class="chip${cls}" data-go="p:${pi}">${esc(P.he)}</button>`;
      });
      h += '</div>';
    }
    h += '<h3>פרשות מחוברות</h3><div class="grid">';
    for (const p of PAIRS) {
      const cls = cur === p.join(',') ? ' on' : '';
      h += `<button type="button" class="chip${cls}" data-go="p:${p.join(',')}">${esc(M.parashot[p[0]].he)}–${esc(M.parashot[p[1]].he)}</button>`;
    }
    h += '</div><p class="hint">המסגרת המודגשת = פרשת השבוע.</p>';
    el.innerHTML = h;
  } else {
    let h = '<h3>ספר</h3><div class="grid">';
    for (let b = 0; b < 5; b++) h += `<button type="button" class="chip${b === pickBook ? ' on' : ''}" data-pb="${b}">${esc(M.books[b].he)}</button>`;
    h += '</div><h3>פרק</h3><div class="grid">';
    M.books[pickBook].verses.forEach((n, i) => {
      h += `<button type="button" class="chip num${i + 1 === pickChapter ? ' on' : ''}" data-pc="${i + 1}">${gem(i + 1)}</button>`;
    });
    h += '</div>';
    if (pickChapter) {
      h += `<h3>פסוק בפרק ${gem(pickChapter)}</h3><div class="grid"><button type="button" class="chip" data-go="c:${pickBook}:${pickChapter}">לכל הפרק</button>`;
      for (let v = 1; v <= nVerses(pickBook, pickChapter); v++) h += `<button type="button" class="chip num" data-gv="${v}">${gem(v)}</button>`;
      h += '</div>';
    } else h += '<p class="hint">בחרו פרק, ואז פסוק (או את כל הפרק).</p>';
    el.innerHTML = h;
  }
}
function swRow(key, label) {
  return `<div class="row"><label>${label}</label><div class="sw-colors">` +
    COLORS.map(([k, n]) => `<button type="button" class="sw${S[key] === k ? ' on' : ''}" data-col="${key}:${k}" title="${n}" style="background:var(--k-${k})"></button>`).join('') +
    '</div></div>';
}
function toggleRow(key, label) {
  return `<div class="row"><label>${label}</label><button type="button" class="switch" role="switch" aria-checked="${!!S[key]}" data-tog="${key}"></button></div>`;
}
function segRow(key, label, opts) {
  return `<div class="row"><label>${label}</label><div class="seg">` +
    opts.map(([v, n]) => `<button type="button" class="seg-btn" aria-selected="${S[key] === v}" data-set="${key}:${v}">${n}</button>`).join('') + '</div></div>';
}
function buildSet(el) {
  el.innerHTML = '<h3>תצוגה</h3>' +
    toggleRow('rashi', 'רש״י') + toggleRow('nikud', 'ניקוד') + toggleRow('teamim', 'טעמים') + toggleRow('aliyot', 'סימון עליות') +
    `<div class="row"><label>גודל גופן</label><div class="seg"><button type="button" class="seg-btn" data-fs="-4">−</button><button type="button" class="seg-btn" disabled>${S.fs}</button><button type="button" class="seg-btn" data-fs="4">+</button></div></div>` +
    '<h3>צבעים</h3>' + swRow('c1', 'מקרא — פעם ראשונה') + swRow('c2', 'מקרא — פעם שנייה') + swRow('ct', 'תרגום אונקלוס') +
    '<h3>פרשת השבוע והפטרה</h3>' +
    segRow('il', 'מקום', [[true, 'ארץ ישראל'], [false, 'חוץ לארץ']]) +
    segRow('nusach', 'נוסח ההפטרה', [['a', 'אשכנז'], ['s', 'ספרד']]) +
    '<p class="hint">לחיצה על מספר פסוק שומרת שם סימניה. „📌 המשך” חוזר אליה.</p>';
}
function buildAbout(el) {
  el.innerHTML = '<h3>שניים מקרא ואחד תרגום</h3>' +
    '<p>כל פסוק פעמיים (בשני צבעים) ואחריו תרגום אונקלוס — כל פסוק בפסקה משלו. בסוף הפרשה: הפסוק האחרון פעמיים, ושלושה פסוקים ראשונים מהפרשה הבאה (אחרי וזאת הברכה — בראשית).</p>' +
    '<p>פרשת השבוע מחושבת לפי לוח עברי מקומי (ארץ ישראל או חוץ לארץ), כולל פרשות מחוברות ושבתות מיוחדות להפטרה.</p>' +
    `<p class="hint">מקורות: ${esc(M.source)}</p><p class="hint">AAG · גרסה 0.2.1 · עובד בלי אינטרנט</p>`;
}

/* ---------- events ---------- */
function bind() {
  $('modeParasha').onclick = () => {
    if (S.mode === 'p') return;
    const v = S.view;
    let pi = v && v.t === 'c' ? parashaOf(v.b, v.c, 1) : -1;
    go(pi >= 0 ? { t: 'p', ps: [pi] } : weeklyView());
  };
  $('modeChapter').onclick = () => {
    if (S.mode === 'c') return;
    const s = S.view && S.view.t === 'p' ? pStart(S.view.ps[0]) : [0, 1, 1];
    go({ t: 'c', b: s[0], c: s[1] });
  };
  $('pickBtn').onclick = () => {
    if (S.view && S.view.t === 'c') { pickBook = S.view.b; pickChapter = 0; }
    togglePop('pickPop', buildPick);
  };
  $('weekBtn').onclick = () => go(weeklyView());
  $('resumeBtn').onclick = resume;
  $('setBtn').onclick = () => togglePop('setPop', buildSet);
  $('aboutBtn').onclick = () => togglePop('aboutPop', buildAbout);
  $('fsUp').onclick = () => setFs(4);
  $('fsDown').onclick = () => setFs(-4);

  document.addEventListener('click', e => {
    const t = e.target.closest('button, .vn, summary');
    if (!t) {
      if (!e.target.closest('.pop')) closePops();
      return;
    }
    const d = t.dataset;
    if (d.go) {
      const [k, a, c] = d.go.split(':');
      if (k === 'p') go({ t: 'p', ps: a.split(',').map(Number) });
      else go({ t: 'c', b: +a, c: +c });
    } else if (d.pb !== undefined) { pickBook = +d.pb; pickChapter = 0; buildPick($('pickPop')); }
    else if (d.pc) { pickChapter = +d.pc; buildPick($('pickPop')); }
    else if (d.gv) go({ t: 'c', b: pickBook, c: pickChapter }, `v-${pickBook}-${pickChapter}-${d.gv}`);
    else if (d.tog) { S[d.tog] = !S[d.tog]; save(); buildSet($('setPop')); render(); }
    else if (d.set) {
      const [k, v] = d.set.split(':');
      S[k] = v === 'true' ? true : v === 'false' ? false : v;
      if (k === 'il' && S.view && S.view.rd) S.view = weeklyView();
      save(); buildSet($('setPop')); render();
    } else if (d.col) { const [k, v] = d.col.split(':'); S[k] = v; save(); buildSet($('setPop')); applyLook(); }
    else if (d.fs) setFs(+d.fs);
    else if (d.haf) { hafChoice = d.haf; render(); }
    else if (d.r && t.classList.contains('vn')) setBookmark(d.r.split(':').map(Number));
    if (!t.closest('.pop') && !['pickBtn', 'setBtn', 'aboutBtn'].includes(t.id)) closePops();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePops(); });
}
function setFs(d) {
  S.fs = Math.max(16, Math.min(80, S.fs + d));
  save(); applyLook();
  if (!$('setPop').hidden) buildSet($('setPop'));
}

/* ---------- storage / host ---------- */
let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem('aag-shnayim-mikra', JSON.stringify(S)); } catch (e) { /* ignore */ }
    if (HAS_OTZ) Otzaria.call('storage.set', { key: KEY, value: S }).catch(() => {});
  }, 250);
}
// stored state from before 0.2.1 (no fsv): drop its small font size so the new larger default applies
function migrate(v) { if (v.fsv !== DEF.fsv) { delete v.fs; v.fsv = DEF.fsv; } return v; }
function loadLocal() {
  try {
    const v = JSON.parse(localStorage.getItem('aag-shnayim-mikra') || 'null');
    if (v && typeof v === 'object') Object.assign(S, migrate(v));
  } catch (e) { /* ignore */ }
}
function validView(v) {
  if (!v || typeof v !== 'object') return false;
  if (v.t === 'p') return Array.isArray(v.ps) && v.ps.length && v.ps.every(x => Number.isInteger(x) && x >= 0 && x < 54);
  if (v.t === 'c') return M.books[v.b] && v.c >= 1 && v.c <= M.books[v.b].verses.length;
  return false;
}
function sanitize() {
  for (const k of ['c1', 'c2', 'ct']) if (!COLORS.some(c => c[0] === S[k])) S[k] = DEF[k];
  S.fs = Math.max(16, Math.min(80, Number(S.fs) || DEF.fs));
  if (!validView(S.view)) S.view = weeklyView();
  if (S.view.rd) S.view = weeklyView(); // a dated view always means "this week"
  if (S.bm && !(Array.isArray(S.bm.r) && validView(S.bm.view))) S.bm = null;
  S.mode = S.view.t;
}
function luminance(c) {
  if (typeof c === 'number') c = '#' + (c >>> 0).toString(16).padStart(8, '0').slice(2);
  if (typeof c !== 'string') return null;
  const m = c.replace('#', '').match(/^(?:[0-9a-f]{2})?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  const [r, g, b] = m.slice(1).map(x => parseInt(x, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function applyOtzariaTheme(theme) {
  if (!theme) return;
  let mode = null;
  const cs = theme.colorScheme;
  if (cs === 'dark' || cs === 'light') mode = cs;
  else if (theme.brightness === 'dark' || theme.brightness === 'light') mode = theme.brightness;
  else if (typeof theme.isDark === 'boolean') mode = theme.isDark ? 'dark' : 'light';
  else if (cs && typeof cs === 'object') {
    if (cs.brightness === 'dark' || cs.brightness === 'light') mode = cs.brightness;
    else {
      const l = luminance(cs.surface || cs.background);
      if (l !== null) mode = l < 0.45 ? 'dark' : 'light';
    }
  }
  if (mode) document.documentElement.setAttribute('data-theme', mode);
}
let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
}

/* ---------- boot ---------- */
loadLocal();
sanitize();
bind();
render();
if (HAS_OTZ) {
  Otzaria.on('plugin.boot', async payload => {
    applyOtzariaTheme(payload && payload.theme);
    try {
      const res = await Otzaria.call('storage.get', { key: KEY });
      const v = res && (res.data !== undefined ? res.data : res.value);
      if (v && typeof v === 'object') { Object.assign(S, migrate(v)); sanitize(); render(); }
    } catch (e) { /* keep local settings */ }
  });
  Otzaria.on('theme.changed', applyOtzariaTheme);
}
