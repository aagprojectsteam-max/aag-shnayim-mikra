/* AAG Shnayim Mikra — Hebrew calendar + weekly parasha (own implementation).
 * Fixed dates are "RD" day numbers (1 = Monday 1 Jan 1 CE, Gregorian). Months: Nisan=1 … Adar=12, Adar II=13, Tishrei=7.
 * Weekly reading: anchored fill per segment (Pesach, Shavuot, Tisha B'Av, Rosh Hashana), diaspora first,
 * then Israel derived from it (Israel is one week ahead after a diaspora-only festival Shabbat until it splits a double). */
(function (global) {
  'use strict';
  const EPOCH = -1373427;
  const mod = (a, b) => ((a % b) + b) % b;
  const isLeap = y => mod(7 * y + 1, 19) < 7;
  const lastMonth = y => (isLeap(y) ? 13 : 12);
  function elapsed(y) {
    const months = Math.floor((235 * y - 234) / 19);
    const parts = 12084 + 13753 * months;
    let day = 29 * months + Math.floor(parts / 25920);
    if (mod(3 * (day + 1), 7) < 3) day++;
    return day;
  }
  function delay(y) {
    const a = elapsed(y - 1), b = elapsed(y), c = elapsed(y + 1);
    if (c - b === 356) return 2;
    if (b - a === 382) return 1;
    return 0;
  }
  const newYear = y => EPOCH + elapsed(y) + delay(y);
  const daysInYear = y => newYear(y + 1) - newYear(y);
  function monthDays(y, m) {
    if ([2, 4, 6, 10, 13].includes(m)) return 29;
    if (m === 12 && !isLeap(y)) return 29;
    if (m === 8 && ![355, 385].includes(daysInYear(y))) return 29;
    if (m === 9 && [353, 383].includes(daysInYear(y))) return 29;
    return 30;
  }
  function fromHeb(y, m, d) {
    let r = newYear(y) + d - 1;
    if (m < 7) {
      for (let i = 7; i <= lastMonth(y); i++) r += monthDays(y, i);
      for (let i = 1; i < m; i++) r += monthDays(y, i);
    } else {
      for (let i = 7; i < m; i++) r += monthDays(y, i);
    }
    return r;
  }
  function toHeb(rd) {
    let y = Math.floor((rd - EPOCH) / 365.25) + 1;
    while (newYear(y + 1) <= rd) y++;
    while (newYear(y) > rd) y--;
    let m = rd < fromHeb(y, 1, 1) ? 7 : 1;
    while (rd > fromHeb(y, m, monthDays(y, m))) m++;
    return { y, m, d: rd - fromHeb(y, m, 1) + 1 };
  }
  function fromGreg(Y, M, D) {
    const y = Y - 1;
    let r = 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + Math.floor((367 * M - 362) / 12);
    if (M > 2) r -= (Y % 4 === 0 && (Y % 100 !== 0 || Y % 400 === 0)) ? 1 : 2;
    return r + D;
  }
  const fromDate = dt => fromGreg(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  function toDate(rd) {
    const base = fromGreg(1970, 1, 1);
    const t = new Date(1970, 0, 1);
    t.setDate(1 + rd - base);
    return t;
  }
  const dow = rd => mod(rd, 7); // 0 = Sunday … 6 = Shabbat
  const shabbatOnOrAfter = rd => rd + mod(6 - dow(rd), 7);

  // ---- weekly reading -------------------------------------------------------
  function isHoliday(rd, il) {
    const h = toHeb(rd);
    if (h.m === 7 && [1, 2, 10].includes(h.d)) return true;
    if (h.m === 7 && h.d >= 15 && h.d <= (il ? 22 : 23)) return true;
    if (h.m === 1 && h.d >= 15 && h.d <= (il ? 21 : 22)) return true;
    if (h.m === 3 && (h.d === 6 || (!il && h.d === 7))) return true;
    return false;
  }
  const cache = {};
  /* Cycle Y: from the Shabbat after Simchat Torah of Y to the last Shabbat before Sukkot of Y+1.
   * Returns [{rd, p:[indices]} | {rd, hol:true}] */
  function cycle(Y, il) {
    const key = Y + (il ? 'i' : 'd');
    if (cache[key]) return cache[key];
    const res = il ? israelCycle(Y) : diasporaCycle(Y);
    cache[key] = res;
    return res;
  }
  function shabbatot(from, to) { // from <= rd < to
    const out = [];
    for (let s = shabbatOnOrAfter(from); s < to; s += 7) out.push(s);
    return out;
  }
  function diasporaCycle(Y) {
    const N = Y;
    const start = fromHeb(Y, 7, 24);
    const leap = isLeap(N);
    const rhNext = fromHeb(N + 1, 7, 1); // not used for segment bounds; kept for clarity
    void rhNext;
    const segs = [
      { end: fromHeb(N, 1, 15), target: leap ? 27 : 24, pairs: [[21, 22], [26, 27]] },
      { end: fromHeb(N, 3, 6), target: 33, pairs: [[26, 27], [28, 29], [31, 32]] },
      { end: fromHeb(N, 5, 10), target: 43, pairs: [[41, 42], [38, 39]] },
      { end: fromHeb(N + 1, 7, 1), target: 51, pairs: [[50, 51]] },
    ];
    // Vayeilech is read separately on Shabbat Shuva only if two Shabbatot fall between RH and Sukkot.
    const rhDow = dow(fromHeb(N + 1, 7, 1));
    const vayeilechAlone = rhDow === 1 || rhDow === 2;
    if (vayeilechAlone) segs[3].target = 50;
    const out = [];
    let ptr = 0, from = start;
    for (const sg of segs) {
      const days = shabbatot(from, sg.end);
      const usable = days.filter(d => !isHoliday(d, false));
      let target = Math.max(sg.target, ptr - 1);
      let n = target - ptr + 1;
      const m = usable.length;
      let pairs = sg.pairs.filter(([a, b]) => a >= ptr && b <= target);
      if (m > n && sg !== segs[3]) { target += m - n; n = m; pairs = []; }
      let k = Math.max(0, n - m);
      const joined = new Set(pairs.slice(0, k).map(p => p[0]));
      const units = [];
      for (let i = ptr; i <= target; i++) {
        if (joined.has(i)) { units.push([i, i + 1]); i++; } else units.push([i]);
      }
      let u = 0;
      for (const d of days) {
        if (isHoliday(d, false) || u >= units.length) out.push({ rd: d, hol: true });
        else out.push({ rd: d, p: units[u++] });
      }
      ptr = target + 1;
      from = sg.end;
    }
    // Between Rosh Hashana and Sukkot of N+1
    const tail = shabbatot(fromHeb(N + 1, 7, 1), fromHeb(N + 1, 7, 15));
    const rest = vayeilechAlone ? [[51], [52]] : [[52]];
    let r = 0;
    for (const d of tail) {
      if (isHoliday(d, false) || r >= rest.length) out.push({ rd: d, hol: true });
      else out.push({ rd: d, p: rest[r++] });
    }
    return out;
  }
  function israelCycle(Y) {
    const D = diasporaCycle(Y).map(x => Object.assign({}, x));
    const N = Y;
    const shavuot = fromHeb(N, 3, 6);
    for (let i = 0; i < D.length; i++) {
      const d = D[i];
      if (!d.hol || isHoliday(d.rd, true)) continue;
      // Diaspora-only festival Shabbat: Israel reads ahead. Pick the diaspora double that Israel splits.
      const after = [];
      for (let j = i + 1; j < D.length; j++) if (!D[j].hol) after.push(j);
      const doubles = after.filter(j => D[j].p.length === 2);
      const pesach = toHeb(d.rd).m === 1;
      let split = doubles[0];
      if (pesach) {
        const before = doubles.filter(j => D[j].rd < shavuot);
        if (before.length) split = before[before.length - 1];
      }
      if (split === undefined) break;
      const units = [];
      for (const j of after) {
        if (j > split) break;
        if (j === split) units.push([D[j].p[0]], [D[j].p[1]]);
        else units.push(D[j].p);
      }
      const slots = [i].concat(after.filter(j => j <= split));
      slots.forEach((j, n) => { D[j] = { rd: D[j].rd, p: units[n] }; });
      break; // at most one such Shabbat per cycle
    }
    return D;
  }
  /* Reading for the Shabbat on/after rd: {rd, p:[indices]} or {rd, hol:true}. */
  function readingFor(rd, il) {
    const s = shabbatOnOrAfter(rd);
    const h = toHeb(s);
    const Y = s >= fromHeb(h.y, 7, 24) ? h.y : h.y - 1;
    const c = cycle(Y, il);
    return c.find(x => x.rd === s) || { rd: s, hol: true };
  }
  /* Next Shabbat (from rd) that has a regular reading. */
  function weekly(rd, il) {
    let r = readingFor(rd, il);
    let guard = 0;
    while (r.hol && guard++ < 5) r = readingFor(r.rd + 1, il);
    return r;
  }
  /* Special Shabbat keys for the haftarah note. */
  function special(rd, parasha) {
    const h = toHeb(rd);
    const out = [];
    const adar = isLeap(h.y) ? 13 : 12;
    const inRange = (m, d1, m2, d2) => rd >= fromHeb(h.y, m, d1) && rd <= fromHeb(h.y, m2, d2);
    const purim = fromHeb(h.y, adar, 14), nisan1 = fromHeb(h.y, 1, 1), adar1 = fromHeb(h.y, adar, 1);
    const shekalim = adar1 - mod(dow(adar1) - 6, 7);
    if (rd === shekalim) out.push('shekalim');
    if (rd === purim - 1 - mod(dow(purim - 1) - 6, 7)) out.push('zachor');
    const chodesh = nisan1 - mod(dow(nisan1) - 6, 7);
    if (rd === chodesh) out.push('hachodesh');
    if (rd === chodesh - 7) out.push('parah');
    if (h.m === 1 && h.d >= 8 && h.d <= 14) out.push('hagadol');
    if (h.m === 7 && h.d >= 3 && h.d <= 9) out.push('shuva');
    const ch = fromHeb(h.y, 9, 25);
    if (rd >= ch && rd <= ch + 7) out.push(rd - 7 >= ch ? 'chanukah2' : 'chanukah1');
    if (h.d === 30 || h.d === 1) out.push('roshchodesh');
    else if (h.d === 29 && h.m !== 6) out.push('macharchodesh');
    if (parasha === 40 && inRange(4, 17, 5, 9)) out.push('pinchas_bein');
    return [...new Set(out)];
  }
  const HEB_MONTHS = ['', 'ניסן', 'אייר', 'סיון', 'תמוז', 'אב', 'אלול', 'תשרי', 'חשון', 'כסלו', 'טבת', 'שבט', 'אדר', 'אדר ב׳'];
  function monthName(y, m) { return m === 12 && isLeap(y) ? 'אדר א׳' : HEB_MONTHS[m]; }
  global.SMCal = { fromHeb, toHeb, fromGreg, fromDate, toDate, dow, isLeap, readingFor, weekly, special, monthName, shabbatOnOrAfter };
})(typeof window !== 'undefined' ? window : globalThis);
